#include <ArduinoBLE.h>
#include "LSM6DS3.h"
#include "Wire.h"
#include <math.h>

// Seeed XIAO nRF52840 Sense IMU at the bottom/base of the mast.
LSM6DS3 myIMU(I2C_MODE, 0x6A);

// Must match the top node packet exactly.
struct GravityPacket {
  float gx;
  float gy;
  float gz;
  uint32_t seq;
};

// ---------- BLE link: base bridge -> browser dashboard ----------
BLEService pcService("7A100000-3E2D-4B6A-9F10-112233445566");

BLEStringCharacteristic telemetryChar(
  "7A100001-3E2D-4B6A-9F10-112233445566",
  BLERead | BLENotify,
  220
);

BLEStringCharacteristic commandChar(
  "7A100002-3E2D-4B6A-9F10-112233445566",
  BLEWrite,
  40
);

BLEStringCharacteristic statusChar(
  "7A100003-3E2D-4B6A-9F10-112233445566",
  BLERead | BLENotify,
  160
);

// ---------- BLE link: base bridge -> top IMU node ----------
BLEDevice topPeripheral;
BLECharacteristic topGravityCharacteristic;

const char TOP_NODE_NAME[] = "XIAO_TOP_IMU";
const char BASE_NODE_NAME[] = "XIAO_BASE_BRIDGE";
const char TOP_GRAVITY_UUID[] = "19B10011-E8F2-537E-4F6C-D104768A1214";

// -------- Tuning --------
const uint32_t UPDATE_INTERVAL_MS = 50;       // 20 Hz output to browser
const uint32_t STATUS_INTERVAL_MS = 500;      // 2 Hz status updates
const uint32_t TOP_SCAN_TIMEOUT_MS = 3500;    // keep short so browser pairing remains responsive
const uint32_t RECONNECT_INTERVAL_MS = 5000;
const float FILTER_ALPHA = 0.93f;             // higher = smoother but slower response
const float MIN_ACCEL_NORM = 0.70f;           // reject heavy motion/vibration samples
const float MAX_ACCEL_NORM = 1.30f;

// Axis remap/sign correction.
// map indexes: 0 = x, 1 = y, 2 = z.
// Leave as identity if both IMUs are mounted with the same X/Y/Z directions.
const int BASE_MAP[3] = {0, 1, 2};
const int TOP_MAP[3]  = {0, 1, 2};
const float BASE_SIGN[3] = {1.0f, 1.0f, 1.0f};
const float TOP_SIGN[3]  = {1.0f, 1.0f, 1.0f};

float baseG[3] = {0.0f, 0.0f, 1.0f};
float topG[3]  = {0.0f, 0.0f, 1.0f};
bool baseFilterReady = false;
bool topPacketReady = false;
uint32_t topSeq = 0;

float baseRoll = 0.0f;
float basePitch = 0.0f;
float topRoll = 0.0f;
float topPitch = 0.0f;

float zeroBaseRoll = 0.0f;
float zeroBasePitch = 0.0f;
float zeroTopRoll = 0.0f;
float zeroTopPitch = 0.0f;

bool sensingEnabled = false;
bool topConnected = false;
bool zeroReady = false;
bool forceTopPairing = false;

uint32_t lastOutput = 0;
uint32_t lastStatus = 0;
uint32_t lastReconnectAttempt = 0;

float wrapDeg(float a) {
  while (a > 180.0f) a -= 360.0f;
  while (a < -180.0f) a += 360.0f;
  return a;
}

void normalise3(float v[3]) {
  float n = sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (n > 0.0001f) {
    v[0] /= n;
    v[1] /= n;
    v[2] /= n;
  }
}

void remapVector(const float in[3], const int mapIdx[3], const float sign[3], float out[3]) {
  out[0] = sign[0] * in[mapIdx[0]];
  out[1] = sign[1] * in[mapIdx[1]];
  out[2] = sign[2] * in[mapIdx[2]];
  normalise3(out);
}

bool readNormalisedAccel(float g[3]) {
  float ax = myIMU.readFloatAccelX();
  float ay = myIMU.readFloatAccelY();
  float az = myIMU.readFloatAccelZ();

  float n = sqrt(ax * ax + ay * ay + az * az);
  if (n < MIN_ACCEL_NORM || n > MAX_ACCEL_NORM) {
    return false;
  }

  g[0] = ax / n;
  g[1] = ay / n;
  g[2] = az / n;
  return true;
}

void updateBaseGravityFilter() {
  float raw[3];
  if (!readNormalisedAccel(raw)) {
    return;
  }

  float mapped[3];
  remapVector(raw, BASE_MAP, BASE_SIGN, mapped);

  if (!baseFilterReady) {
    baseG[0] = mapped[0];
    baseG[1] = mapped[1];
    baseG[2] = mapped[2];
    baseFilterReady = true;
    return;
  }

  baseG[0] = FILTER_ALPHA * baseG[0] + (1.0f - FILTER_ALPHA) * mapped[0];
  baseG[1] = FILTER_ALPHA * baseG[1] + (1.0f - FILTER_ALPHA) * mapped[1];
  baseG[2] = FILTER_ALPHA * baseG[2] + (1.0f - FILTER_ALPHA) * mapped[2];
  normalise3(baseG);
}

void vectorToRollPitch(const float g[3], float &roll, float &pitch) {
  roll  = atan2(g[1], g[2]) * 180.0f / PI;
  pitch = atan2(-g[0], sqrt(g[1] * g[1] + g[2] * g[2])) * 180.0f / PI;
}

float angleBetweenVectors(const float a[3], const float b[3]) {
  float dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (dot > 1.0f) dot = 1.0f;
  if (dot < -1.0f) dot = -1.0f;
  return acos(dot) * 180.0f / PI;
}

void updateAngles() {
  vectorToRollPitch(baseG, baseRoll, basePitch);
  vectorToRollPitch(topG, topRoll, topPitch);
}

void writeStatus() {
  String status =
    String("topConnected=") + (topConnected ? "1" : "0") + "," +
    String("sensingEnabled=") + (sensingEnabled ? "1" : "0") + "," +
    String("zeroReady=") + (zeroReady ? "1" : "0") + "," +
    String("baseReady=") + (baseFilterReady ? "1" : "0") + "," +
    String("topSeq=") + String(topSeq) + "," +
    String("millis=") + String(millis());

  statusChar.writeValue(status);
}

void zeroCurrentPose() {
  updateAngles();
  zeroBaseRoll = baseRoll;
  zeroBasePitch = basePitch;
  zeroTopRoll = topRoll;
  zeroTopPitch = topPitch;
  zeroReady = true;
  Serial.println("ZERO completed");
  writeStatus();
}

bool connectToTopNode() {
  Serial.println("Scanning for top node...");
  writeStatus();

  BLE.scanForName(TOP_NODE_NAME);
  uint32_t start = millis();

  while (millis() - start < TOP_SCAN_TIMEOUT_MS) {
    BLE.poll();

    BLEDevice dev = BLE.available();
    if (dev && dev.localName() == TOP_NODE_NAME) {
      BLE.stopScan();
      Serial.println("Found top node. Connecting...");

      if (!dev.connect()) {
        Serial.println("Top connect failed");
        topConnected = false;
        writeStatus();
        return false;
      }

      if (!dev.discoverAttributes()) {
        Serial.println("Top attribute discovery failed");
        dev.disconnect();
        topConnected = false;
        writeStatus();
        return false;
      }

      BLECharacteristic ch = dev.characteristic(TOP_GRAVITY_UUID);
      if (!ch) {
        Serial.println("Top gravity characteristic not found");
        dev.disconnect();
        topConnected = false;
        writeStatus();
        return false;
      }

      if (!ch.canSubscribe() || !ch.subscribe()) {
        Serial.println("Top subscribe failed");
        dev.disconnect();
        topConnected = false;
        writeStatus();
        return false;
      }

      topPeripheral = dev;
      topGravityCharacteristic = ch;
      topConnected = true;
      topPacketReady = false;
      Serial.println("Top node connected");
      writeStatus();
      return true;
    }

    delay(20);
  }

  BLE.stopScan();
  topConnected = false;
  Serial.println("Top node not found");
  writeStatus();
  return false;
}

void readTopPacketIfAvailable() {
  if (!topConnected) return;
  if (!topGravityCharacteristic.valueUpdated()) return;

  GravityPacket pkt;
  int len = topGravityCharacteristic.readValue((uint8_t *)&pkt, sizeof(pkt));
  if (len != sizeof(pkt)) return;

  float raw[3] = {pkt.gx, pkt.gy, pkt.gz};
  remapVector(raw, TOP_MAP, TOP_SIGN, topG);
  topSeq = pkt.seq;
  topPacketReady = true;
}

void writeTelemetry() {
  float baseDeltaRoll = wrapDeg(baseRoll - zeroBaseRoll);
  float baseDeltaPitch = wrapDeg(basePitch - zeroBasePitch);
  float topDeltaRoll = wrapDeg(topRoll - zeroTopRoll);
  float topDeltaPitch = wrapDeg(topPitch - zeroTopPitch);

  // Signed top relative to bottom/base.
  float topMinusBaseRoll = wrapDeg(topDeltaRoll - baseDeltaRoll);
  float topMinusBasePitch = wrapDeg(topDeltaPitch - baseDeltaPitch);

  // Reverse direction. Same physical difference, opposite sign.
  float baseMinusTopRoll = -topMinusBaseRoll;
  float baseMinusTopPitch = -topMinusBasePitch;

  // Small-angle mast-bend magnitude after zeroing.
  float bendMagnitude = sqrt(topMinusBaseRoll * topMinusBaseRoll + topMinusBasePitch * topMinusBasePitch);

  // Raw symmetric angle between filtered gravity vectors.
  float vectorAngle = angleBetweenVectors(topG, baseG);

  // CSV fields:
  // baseRoll,basePitch,topRoll,topPitch,topMinusBaseRoll,topMinusBasePitch,bendMagnitude,baseMinusTopRoll,baseMinusTopPitch,vectorAngle,topSeq
  String payload =
    String(baseRoll, 2) + "," +
    String(basePitch, 2) + "," +
    String(topRoll, 2) + "," +
    String(topPitch, 2) + "," +
    String(topMinusBaseRoll, 2) + "," +
    String(topMinusBasePitch, 2) + "," +
    String(bendMagnitude, 2) + "," +
    String(baseMinusTopRoll, 2) + "," +
    String(baseMinusTopPitch, 2) + "," +
    String(vectorAngle, 2) + "," +
    String(topSeq);

  telemetryChar.writeValue(payload);

  Serial.print("Telemetry: ");
  Serial.println(payload);
}

void handleCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "START") {
    if (!zeroReady && topPacketReady && baseFilterReady) {
      zeroCurrentPose();
    }
    sensingEnabled = true;
    Serial.println("START");
  } else if (cmd == "STOP") {
    sensingEnabled = false;
    Serial.println("STOP");
  } else if (cmd == "ZERO") {
    if (topPacketReady && baseFilterReady) {
      zeroCurrentPose();
    } else {
      Serial.println("ZERO ignored: waiting for both IMUs");
    }
  } else if (cmd == "PAIR" || cmd == "PAIR_TOP" || cmd == "SCAN") {
    forceTopPairing = true;
    Serial.println("PAIR_TOP requested");
  } else if (cmd == "RESET_ZERO") {
    zeroReady = false;
    Serial.println("Zero state cleared");
  }

  writeStatus();
}

void setup() {
  Serial.begin(115200);
  uint32_t serialStart = millis();
  while (!Serial && millis() - serialStart < 2000) {}

  Wire.begin();

  if (myIMU.begin() != 0) {
    Serial.println("Base IMU init failed");
    while (1) {}
  }

  for (int i = 0; i < 50; i++) {
    updateBaseGravityFilter();
    delay(10);
  }

  if (!BLE.begin()) {
    Serial.println("BLE init failed");
    while (1) {}
  }

  BLE.setLocalName(BASE_NODE_NAME);
  BLE.setDeviceName(BASE_NODE_NAME);
  BLE.setAdvertisedService(pcService);

  pcService.addCharacteristic(telemetryChar);
  pcService.addCharacteristic(commandChar);
  pcService.addCharacteristic(statusChar);
  BLE.addService(pcService);

  telemetryChar.writeValue("0,0,0,0,0,0,0,0,0,0,0");
  writeStatus();
  BLE.advertise();

  Serial.println("Base bridge advertising to browser");
  forceTopPairing = true;
}

void loop() {
  BLE.poll();

  if (commandChar.written()) {
    handleCommand(commandChar.value());
  }

  if (topConnected && !topPeripheral.connected()) {
    topConnected = false;
    topPacketReady = false;
    writeStatus();
  }

  if (forceTopPairing || (!topConnected && millis() - lastReconnectAttempt > RECONNECT_INTERVAL_MS)) {
    forceTopPairing = false;
    lastReconnectAttempt = millis();
    connectToTopNode();
  }

  updateBaseGravityFilter();
  readTopPacketIfAvailable();
  updateAngles();

  if (!zeroReady && topPacketReady && baseFilterReady) {
    zeroCurrentPose();
  }

  if (sensingEnabled && zeroReady && topPacketReady && baseFilterReady && millis() - lastOutput >= UPDATE_INTERVAL_MS) {
    lastOutput = millis();
    writeTelemetry();
  }

  if (millis() - lastStatus >= STATUS_INTERVAL_MS) {
    lastStatus = millis();
    writeStatus();
  }
}
