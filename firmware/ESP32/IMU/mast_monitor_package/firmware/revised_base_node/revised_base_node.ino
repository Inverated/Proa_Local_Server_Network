#include <ArduinoBLE.h>
#include "LSM6DS3.h"
#include "Wire.h"
#include <math.h>

LSM6DS3 myIMU(I2C_MODE, 0x6A);

struct GravityPacket {
  float gx;
  float gy;
  float gz;
  uint32_t seq;
};

// ---------- Link to top node ----------
BLEDevice topPeripheral;
BLECharacteristic topGravityCharacteristic;

// ---------- PC-facing service ----------
BLEService pcService("7A100000-3E2D-4B6A-9F10-112233445566");

BLEStringCharacteristic telemetryChar(
  "7A100001-3E2D-4B6A-9F10-112233445566",
  BLERead | BLENotify,
  180
);

BLEStringCharacteristic commandChar(
  "7A100002-3E2D-4B6A-9F10-112233445566",
  BLEWrite,
  20
);

// -------- Tuning --------
const uint32_t UPDATE_INTERVAL_MS = 50;     // 20 Hz output
const float FILTER_ALPHA = 0.93f;           // Higher = smoother but slower response
const float MIN_ACCEL_NORM = 0.70f;         // Reject samples during strong motion/vibration
const float MAX_ACCEL_NORM = 1.30f;

// Axis remap/sign correction.
// Leave as identity if the two IMUs are mounted with the same X/Y/Z directions.
// If one node is rotated on the mast, fix it here instead of changing the math.
// map indexes: 0 = x, 1 = y, 2 = z.
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
uint32_t lastOutput = 0;
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

bool connectToTopNode() {
  Serial.println("Scanning for XIAO_TOP_IMU...");
  BLE.scanForName("XIAO_TOP_IMU");

  unsigned long start = millis();
  while (millis() - start < 5000) {
    BLEDevice dev = BLE.available();
    if (dev && dev.localName() == "XIAO_TOP_IMU") {
      BLE.stopScan();

      Serial.println("Found top node, connecting...");
      if (!dev.connect()) {
        Serial.println("Connect failed");
        return false;
      }

      if (!dev.discoverAttributes()) {
        Serial.println("Attribute discovery failed");
        dev.disconnect();
        return false;
      }

      BLECharacteristic ch = dev.characteristic("19B10011-E8F2-537E-4F6C-D104768A1214");
      if (!ch) {
        Serial.println("Top characteristic not found");
        dev.disconnect();
        return false;
      }

      if (!ch.canSubscribe() || !ch.subscribe()) {
        Serial.println("Subscribe failed");
        dev.disconnect();
        return false;
      }

      topPeripheral = dev;
      topGravityCharacteristic = ch;
      topConnected = true;
      Serial.println("Connected to top node");
      return true;
    }

    BLE.poll();
    delay(20);
  }

  BLE.stopScan();
  topConnected = false;
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

void updateAngles() {
  vectorToRollPitch(baseG, baseRoll, basePitch);
  vectorToRollPitch(topG, topRoll, topPitch);
}

void zeroCurrentPose() {
  updateAngles();
  zeroBaseRoll = baseRoll;
  zeroBasePitch = basePitch;
  zeroTopRoll = topRoll;
  zeroTopPitch = topPitch;
  zeroReady = true;
  Serial.println("ZERO");
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
  }
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

  BLE.setLocalName("XIAO_BASE_BRIDGE");
  BLE.setDeviceName("XIAO_BASE_BRIDGE");
  BLE.setAdvertisedService(pcService);

  pcService.addCharacteristic(telemetryChar);
  pcService.addCharacteristic(commandChar);
  BLE.addService(pcService);

  // CSV fields:
  // baseRoll,basePitch,topRoll,topPitch,topMinusBaseRoll,topMinusBasePitch,bendMag,baseMinusTopRoll,baseMinusTopPitch,vectorAngle,topSeq
  telemetryChar.writeValue("0,0,0,0,0,0,0,0,0,0,0");
  BLE.advertise();

  connectToTopNode();
  Serial.println("Base bridge ready");
}

void loop() {
  BLE.poll();

  if (commandChar.written()) {
    handleCommand(commandChar.value());
  }

  if (!topConnected || !topPeripheral.connected()) {
    topConnected = false;
    if (millis() - lastReconnectAttempt > 3000) {
      lastReconnectAttempt = millis();
      connectToTopNode();
    }
  }

  updateBaseGravityFilter();
  readTopPacketIfAvailable();
  updateAngles();

  if (!zeroReady && topPacketReady && baseFilterReady) {
    zeroCurrentPose();
  }

  if (sensingEnabled && zeroReady && topPacketReady && baseFilterReady && millis() - lastOutput >= UPDATE_INTERVAL_MS) {
    lastOutput = millis();

    float baseDeltaRoll = wrapDeg(baseRoll - zeroBaseRoll);
    float baseDeltaPitch = wrapDeg(basePitch - zeroBasePitch);
    float topDeltaRoll = wrapDeg(topRoll - zeroTopRoll);
    float topDeltaPitch = wrapDeg(topPitch - zeroTopPitch);

    // Signed top relative to bottom/base.
    float topMinusBaseRoll = wrapDeg(topDeltaRoll - baseDeltaRoll);
    float topMinusBasePitch = wrapDeg(topDeltaPitch - baseDeltaPitch);

    // The opposite direction is exactly the negative of the same relative result.
    float baseMinusTopRoll = -topMinusBaseRoll;
    float baseMinusTopPitch = -topMinusBasePitch;

    // Small-angle bend magnitude after zeroing. This is usually the most useful mast-bend output.
    float bendMagnitude = sqrt(topMinusBaseRoll * topMinusBaseRoll + topMinusBasePitch * topMinusBasePitch);

    // Raw physical angle between the two filtered gravity vectors. This is symmetric and not signed.
    float vectorAngle = angleBetweenVectors(topG, baseG);

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

    Serial.print("Payload: ");
    Serial.println(payload);
  }
}
