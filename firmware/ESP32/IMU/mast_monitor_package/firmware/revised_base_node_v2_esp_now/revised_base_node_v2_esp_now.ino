#include <ArduinoBLE.h>
#include "LSM6DS3.h"
#include "Wire.h"
#include <math.h>

#include <esp_now.h>
#include <esp_wifi.h>
#include <WiFi.h>

#define LOGGING 0

LSM6DS3 myIMU(I2C_MODE, 0x6A);

struct GravityPacket {
  float gx;
  float gy;
  float gz;
  uint32_t seq;
};

// ---------- Link to top node (unchanged - still BLE) ----------
BLEDevice topPeripheral;
BLECharacteristic topGravityCharacteristic;

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
#if LOGGING
    Serial.println("START");
#endif
  } else if (cmd == "STOP") {
    sensingEnabled = false;
#if LOGGING
    Serial.println("STOP");
#endif
  } else if (cmd == "ZERO") {
    if (topPacketReady && baseFilterReady) {
      zeroCurrentPose();
    } else {
#if LOGGING
        Serial.println("ZERO ignored: waiting for both IMUs");
#endif
    }
  }
}

// =======================
// ESP-NOW CONFIG (PC-facing transmission + command reception)
// =======================

#define SHOW_SUCCESS 0

// Receiver MAC for the PC-side ESP-NOW peer. Update if that module changes.
uint8_t receiverAddr[] = { 0xac, 0xeb, 0xe6, 0x49, 0xc7, 0xcc };

esp_now_peer_info_t peerInfo;

uint32_t str_to_u32(const char s[4]) {
  return ((uint32_t)s[3] << 24) | ((uint32_t)s[2] << 16) | ((uint32_t)s[1] << 8) | ((uint32_t)s[0]);
}

// Fast byte checksum.
// Computes over everything except the checksum field itself.
uint16_t checksum16_bytes(const uint8_t *data, size_t len) {
  uint16_t sum = 0;
  for (size_t i = 0; i < len; i++) {
    sum = (uint16_t)((sum << 1) ^ data[i] ^ (sum >> 15));
  }

  return sum;
}

// PayloadT is application-specific.
// PAD_BYTES is explicit padding, usually 0 unless you want fixed-size packets.
template<typename PayloadT, size_t PAD_BYTES = 0>
struct __attribute__((packed)) PacketTemplate {
  uint32_t header;
  uint16_t counter;
  PayloadT payload;
  uint8_t padding[PAD_BYTES];
  uint16_t chksum;
};

template<typename PacketT>
void clearPacket(PacketT &pkt) {
  memset(&pkt, 0, sizeof(pkt));
}

template<typename PacketT>
void finalizePacket(PacketT &pkt, uint32_t header, uint16_t counter) {
  pkt.header = header;
  pkt.counter = counter;

  pkt.chksum = checksum16_bytes(
    (const uint8_t *)&pkt.counter,
    sizeof(pkt) - sizeof(pkt.header) - sizeof(pkt.chksum));
}

template<typename PacketT>
bool sendPacket(const PacketT &pkt) {
  esp_err_t result = esp_now_send(receiverAddr, (const uint8_t *)&pkt, sizeof(pkt));

  if (result != ESP_OK) {
    taskYIELD();
    result = esp_now_send(receiverAddr, (const uint8_t *)&pkt, sizeof(pkt));
  }

  if (result != ESP_OK) {
    Serial.println("Failed to queue");
    return false;
  }

#if SHOW_SUCCESS
  Serial.println("Successfully queued for sending");
#endif

  return true;
}

void onESPNowSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
#if SHOW_SUCCESS
  if (status == ESP_NOW_SEND_SUCCESS) {
    Serial.println("Delivery Success");
  }
#endif

  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("Delivery Fail");
  }
}

// Command reception over ESP-NOW. Left blank for now - wiring START/STOP/ZERO
// into handleCommand() from here is implemented later.
void onDataRecv(const esp_now_recv_info_t *info, const uint8_t *incomingData, int len) {

}

bool init_ESP_NOW() {
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW failed to initialise");
    return false;
  }

  esp_now_register_send_cb(onESPNowSent);
  esp_now_register_recv_cb(onDataRecv);

  memset(&peerInfo, 0, sizeof(peerInfo));

  memcpy(peerInfo.peer_addr, receiverAddr, 6);

  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
    Serial.println("Failed to add receiving device");
    return false;
  }

  return true;
}

// Telemetry fields kept (everything else - bendMagnitude, baseMinusTopRoll/Pitch,
// vectorAngle - is derivable receiver-side from these, except topMinusBaseRoll/Pitch
// which depend on the on-device zero offsets and can't be reconstructed):
// baseRoll,basePitch,topRoll,topPitch,topMinusBaseRoll,topMinusBasePitch,topSeq
//
// Fixed-point int16 at 0.01 deg resolution (+/-327.68 deg range, plenty for +/-180).
// 7 fields * 2 bytes = 14 bytes payload + 6 bytes padding = 20 bytes,
// so total packet = 4 (header) + 2 (counter) + 20 (payload+pad) + 2 (chksum) = 28 bytes.
const float ANGLE_FIXED_SCALE = 100.0f;

struct __attribute__((packed)) Telemetry_Payload {
  int16_t baseRoll;
  int16_t basePitch;
  int16_t topRoll;
  int16_t topPitch;
  int16_t topMinusBaseRoll;
  int16_t topMinusBasePitch;
  uint16_t topSeq;
};

using Telemetry_Packet = PacketTemplate<Telemetry_Payload, 6>;

uint32_t TELEMETRY_HEADER;
uint16_t telemetryCounter = 1;

void incrementCounter(uint16_t &counter) {
  if (counter == 65535) {
    counter = 1;
  } else {
    counter++;
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

  WiFi.mode(WIFI_STA);

  while (!init_ESP_NOW()) {
    delay(100);
  }

  char role[4] = { 'T', 'E', 'L', 'E' };
  TELEMETRY_HEADER = str_to_u32(role);

  connectToTopNode();
  Serial.println("Base bridge ready");
}

void loop() {
  BLE.poll();

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

    // Small-angle bend magnitude after zeroing. Kept locally for the debug print only -
    // the receiver can recompute this from topMinusBaseRoll/Pitch, so it isn't transmitted.
    float bendMagnitude = sqrt(topMinusBaseRoll * topMinusBaseRoll + topMinusBasePitch * topMinusBasePitch);

    Telemetry_Packet pkt;
    clearPacket(pkt);

    pkt.payload.baseRoll = (int16_t)lroundf(baseRoll * ANGLE_FIXED_SCALE);
    pkt.payload.basePitch = (int16_t)lroundf(basePitch * ANGLE_FIXED_SCALE);
    pkt.payload.topRoll = (int16_t)lroundf(topRoll * ANGLE_FIXED_SCALE);
    pkt.payload.topPitch = (int16_t)lroundf(topPitch * ANGLE_FIXED_SCALE);
    pkt.payload.topMinusBaseRoll = (int16_t)lroundf(topMinusBaseRoll * ANGLE_FIXED_SCALE);
    pkt.payload.topMinusBasePitch = (int16_t)lroundf(topMinusBasePitch * ANGLE_FIXED_SCALE);
    pkt.payload.topSeq = (uint16_t)(topSeq & 0xFFFF);

    finalizePacket(pkt, TELEMETRY_HEADER, telemetryCounter);
    incrementCounter(telemetryCounter);

    sendPacket(pkt);

#if LOGGING
    Serial.print("Sent seq=");
    Serial.print(topSeq);
    Serial.print(" bend=");
    Serial.println(bendMagnitude, 2);
#endif
  }  
}
