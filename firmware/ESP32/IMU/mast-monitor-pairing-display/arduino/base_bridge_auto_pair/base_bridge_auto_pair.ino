/*
 * base_bridge_auto_pair.ino
 * 
 * Seeed XIAO nRF52840 Sense - Base Bridge (Auto-Pair Edition)
 * 
 * This node:
 *  - Has its own IMU (base of mast)
 *  - AUTO-SCANS and connects to the top node (XIAO_TOP_IMU) via BLE central
 *    No "PAIR" command is needed; it scans on boot and reconnects automatically.
 *  - Advertises a BLE peripheral service so an ESP32 (instead of a PC/browser)
 *    can connect and receive telemetry notifications.
 * 
 * The telemetry characteristic sends a compact 17-byte binary struct (TelemetryPacket)
 * at 20 Hz. Angles are int16 fixed-point (×100 = 0.01° resolution).
 * Derived values (bendMagnitude, baseMinusTop) are computed on the receiver.
 * 
 * Commands accepted via BLE write characteristic:
 *   START       - Enable telemetry output
 *   STOP        - Disable telemetry output
 *   ZERO        - Re-zero the current pose
 *   RESET_ZERO  - Clear zero state
 */

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

// Compact telemetry packet sent to ESP32 receiver via BLE notify.
// Angles stored as int16 fixed-point (×100), giving 0.01° resolution, ±327.67° range.
// Derived values (bendMagnitude, baseMinusTop) are computed on the receiver side.
const float ANGLE_SCALE = 100.0f;

struct __attribute__((packed)) TelemetryPacket {
  int16_t  baseRoll;           // 2 bytes - fixed point ×100
  int16_t  basePitch;          // 2 bytes
  int16_t  topRoll;            // 2 bytes
  int16_t  topPitch;           // 2 bytes
  int16_t  topMinusBaseRoll;   // 2 bytes
  int16_t  topMinusBasePitch;  // 2 bytes
  int16_t  vectorAngle;        // 2 bytes
  uint16_t topSeq;             // 2 bytes
  uint8_t  status;             // 1 byte: bit0=topConnected, bit1=sensingEnabled, bit2=zeroReady
};
// sizeof(TelemetryPacket) = 17 bytes

// ---------- BLE Peripheral Service (for ESP32 client to connect) ----------
BLEService espService("7A100000-3E2D-4B6A-9F10-112233445566");

BLECharacteristic telemetryChar(
  "7A100001-3E2D-4B6A-9F10-112233445566",
  BLERead | BLENotify,
  sizeof(TelemetryPacket)
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

// ---------- BLE Central Link: base bridge -> top IMU node ----------
BLEDevice topPeripheral;
BLECharacteristic topGravityCharacteristic;

const char TOP_NODE_NAME[] = "XIAO_TOP_IMU";
const char BASE_NODE_NAME[] = "XIAO_BASE_AUTO";
const char TOP_GRAVITY_UUID[] = "19B10011-E8F2-537E-4F6C-D104768A1214";

// -------- Tuning --------
const uint32_t UPDATE_INTERVAL_MS = 50;       // 20 Hz output
const uint32_t STATUS_INTERVAL_MS = 500;      // 2 Hz status updates
const uint32_t TOP_SCAN_TIMEOUT_MS = 4000;    // scan window for top node
const uint32_t RECONNECT_INTERVAL_MS = 3000;  // retry interval if top disconnected
const float FILTER_ALPHA = 0.93f;
const float MIN_ACCEL_NORM = 0.70f;
const float MAX_ACCEL_NORM = 1.30f;

// Axis remap/sign correction.
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

bool sensingEnabled = true;   // Auto-start since no browser UI
bool topConnected = false;
bool zeroReady = false;

uint32_t lastOutput = 0;
uint32_t lastStatus = 0;
uint32_t lastReconnectAttempt = 0;

// ===================== Utility Functions =====================

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

// ===================== Status / Telemetry =====================

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

void writeTelemetry() {
  float baseDeltaRoll = wrapDeg(baseRoll - zeroBaseRoll);
  float baseDeltaPitch = wrapDeg(basePitch - zeroBasePitch);
  float topDeltaRoll = wrapDeg(topRoll - zeroTopRoll);
  float topDeltaPitch = wrapDeg(topPitch - zeroTopPitch);

  float topMinusBaseRoll = wrapDeg(topDeltaRoll - baseDeltaRoll);
  float topMinusBasePitch = wrapDeg(topDeltaPitch - baseDeltaPitch);
  float vectorAngle = angleBetweenVectors(topG, baseG);

  // Build compact fixed-point packet (17 bytes)
  TelemetryPacket pkt;
  pkt.baseRoll         = (int16_t)lroundf(baseRoll * ANGLE_SCALE);
  pkt.basePitch        = (int16_t)lroundf(basePitch * ANGLE_SCALE);
  pkt.topRoll          = (int16_t)lroundf(topRoll * ANGLE_SCALE);
  pkt.topPitch         = (int16_t)lroundf(topPitch * ANGLE_SCALE);
  pkt.topMinusBaseRoll = (int16_t)lroundf(topMinusBaseRoll * ANGLE_SCALE);
  pkt.topMinusBasePitch = (int16_t)lroundf(topMinusBasePitch * ANGLE_SCALE);
  pkt.vectorAngle      = (int16_t)lroundf(vectorAngle * ANGLE_SCALE);
  pkt.topSeq           = (uint16_t)(topSeq & 0xFFFF);
  pkt.status = (uint8_t)(
    (topConnected ? 1 : 0) |
    (sensingEnabled ? 2 : 0) |
    (zeroReady ? 4 : 0)
  );

  telemetryChar.writeValue((uint8_t *)&pkt, sizeof(pkt));

  Serial.printf("TELE bR=%.2f bP=%.2f tR=%.2f tP=%.2f tmbR=%.2f tmbP=%.2f vA=%.2f seq=%u\n",
    baseRoll, basePitch, topRoll, topPitch, topMinusBaseRoll, topMinusBasePitch, vectorAngle, topSeq);
}

// ===================== Top Node Connection (Auto) =====================

bool connectToTopNode() {
  Serial.println("Auto-scanning for top node...");

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
        return false;
      }

      if (!dev.discoverAttributes()) {
        Serial.println("Top attribute discovery failed");
        dev.disconnect();
        topConnected = false;
        return false;
      }

      BLECharacteristic ch = dev.characteristic(TOP_GRAVITY_UUID);
      if (!ch) {
        Serial.println("Top gravity characteristic not found");
        dev.disconnect();
        topConnected = false;
        return false;
      }

      if (!ch.canSubscribe() || !ch.subscribe()) {
        Serial.println("Top subscribe failed");
        dev.disconnect();
        topConnected = false;
        return false;
      }

      topPeripheral = dev;
      topGravityCharacteristic = ch;
      topConnected = true;
      topPacketReady = false;
      Serial.println("Top node connected (auto)");
      writeStatus();
      return true;
    }

    delay(20);
  }

  BLE.stopScan();
  topConnected = false;
  Serial.println("Top node not found (scan timeout)");
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

// ===================== Command Handler =====================

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
  } else if (cmd == "RESET_ZERO") {
    zeroReady = false;
    Serial.println("Zero state cleared");
  }

  writeStatus();
}

// ===================== Setup =====================

void setup() {
  Serial.begin(115200);
  uint32_t serialStart = millis();
  while (!Serial && millis() - serialStart < 2000) {}

  Serial.println("\n=== Base Bridge Auto-Pair ===");

  Wire.begin();

  if (myIMU.begin() != 0) {
    Serial.println("Base IMU init failed");
    while (1) {}
  }
  Serial.println("Base IMU: OK");

  // Prime the gravity filter
  for (int i = 0; i < 50; i++) {
    updateBaseGravityFilter();
    delay(10);
  }
  Serial.println("Gravity filter primed");

  if (!BLE.begin()) {
    Serial.println("BLE init failed");
    while (1) {}
  }

  // Setup as peripheral (for ESP32 to connect)
  BLE.setLocalName(BASE_NODE_NAME);
  BLE.setDeviceName(BASE_NODE_NAME);
  BLE.setAdvertisedService(espService);

  espService.addCharacteristic(telemetryChar);
  espService.addCharacteristic(commandChar);
  espService.addCharacteristic(statusChar);
  BLE.addService(espService);

  // Write initial zero packet
  TelemetryPacket zeroPkt;
  memset(&zeroPkt, 0, sizeof(zeroPkt));
  telemetryChar.writeValue((uint8_t *)&zeroPkt, sizeof(zeroPkt));
  writeStatus();
  BLE.advertise();

  Serial.println("Advertising as: " + String(BASE_NODE_NAME));

  // Auto-connect to top node on boot (no PAIR command needed)
  Serial.println("Attempting initial top node connection...");
  connectToTopNode();

  Serial.println("=== Setup complete ===\n");
}

// ===================== Loop =====================

void loop() {
  BLE.poll();

  // Handle incoming commands from ESP32 client
  if (commandChar.written()) {
    handleCommand(commandChar.value());
  }

  // Detect top node disconnection
  if (topConnected && !topPeripheral.connected()) {
    topConnected = false;
    topPacketReady = false;
    Serial.println("Top node disconnected");
    writeStatus();
  }

  // Auto-reconnect to top node
  if (!topConnected && millis() - lastReconnectAttempt > RECONNECT_INTERVAL_MS) {
    lastReconnectAttempt = millis();
    connectToTopNode();
  }

  // Read base IMU
  updateBaseGravityFilter();

  // Read top node packets
  readTopPacketIfAvailable();

  // Update angles
  updateAngles();

  // Auto-zero when both IMUs are ready for the first time
  if (!zeroReady && topPacketReady && baseFilterReady) {
    zeroCurrentPose();
  }

  // Send telemetry at 20 Hz
  if (sensingEnabled && zeroReady && topPacketReady && baseFilterReady && millis() - lastOutput >= UPDATE_INTERVAL_MS) {
    lastOutput = millis();
    writeTelemetry();
  }

  // Periodic status update
  if (millis() - lastStatus >= STATUS_INTERVAL_MS) {
    lastStatus = millis();
    writeStatus();
  }
}
