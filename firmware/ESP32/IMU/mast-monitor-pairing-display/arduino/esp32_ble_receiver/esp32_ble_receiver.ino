/*
 * esp32_ble_receiver.ino
 * 
 * Combined ESP32-C3 Node: BLE Mast Telemetry + INA219 Power Sensor
 * 
 * This single ESP32-C3 handles two independent data streams:
 *  1. MAST TELEMETRY (header "MAST"):
 *     - Connects to nRF52840 base bridge ("XIAO_BASE_AUTO") via BLE
 *     - Receives 17-byte structured telemetry at ~10 Hz
 *     - Forwards each packet to master via ESP-NOW
 *  2. POWER SENSOR (header "SENS"):
 *     - Reads INA219 shunt monitor via I2C
 *     - Sends voltage/current/power readings at ~1 Hz to master via ESP-NOW
 * 
 * Both streams are independent and fault-tolerant:
 *  - If BLE is not connected, power sensor still sends.
 *  - If INA219 is not present, mast telemetry still forwards.
 *  - Commands from master via ESP-NOW are forwarded to the nRF52840 via BLE write.
 * 
 * Target: ESP32-C3 (or any ESP32 variant)
 * Board package: esp32 by Espressif (Arduino IDE)
 * 
 * Dependencies:
 *  - Adafruit_INA219 library
 *  - ESP32 BLE Arduino (built-in)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <Wire.h>
#include <Adafruit_INA219.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <BLEClient.h>
#include <BLEAdvertisedDevice.h>
#include <math.h>

// Logging: set to 0 for production to save flash/CPU
#define LOGGING 1
#define SHOW_SUCCESS 0

// =======================
// PIN CONFIG (adjust for your board)
// =======================
#define I2C_SDA_PIN 0
#define I2C_SCL_PIN 1

// =======================
// ESP-NOW PACKET TEMPLATE (shared protocol with master)
// =======================

// Master node MAC address. Update if master module changes.
uint8_t receiverAddr[] = { 0xac, 0xeb, 0xe6, 0x49, 0xc7, 0xcc };

esp_now_peer_info_t peerInfo;

uint32_t str_to_u32(const char s[4]) {
  return ((uint32_t)s[3] << 24) | ((uint32_t)s[2] << 16) | ((uint32_t)s[1] << 8) | ((uint32_t)s[0]);
}

uint16_t checksum16_bytes(const uint8_t *data, size_t len) {
  uint16_t sum = 0;
  for (size_t i = 0; i < len; i++) {
    sum = (uint16_t)((sum << 1) ^ data[i] ^ (sum >> 15));
  }
  return sum;
}

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
#if LOGGING
    Serial.println("ESP-NOW: Send failed");
#endif
    return false;
  }
#if SHOW_SUCCESS
  Serial.println("ESP-NOW: Sent OK");
#endif
  return true;
}

void incrementCounter(uint16_t &counter) {
  counter = (counter == 65535) ? 1 : counter + 1;
}

// =======================
// STREAM 1: MAST TELEMETRY (BLE -> ESP-NOW, header "MAST")
// =======================

// BLE telemetry packet from nRF52840 base bridge (17 bytes)
struct __attribute__((packed)) MastPayload {
  int16_t  baseRoll;           // fixed-point ×100
  int16_t  basePitch;
  int16_t  topRoll;
  int16_t  topPitch;
  int16_t  topMinusBaseRoll;
  int16_t  topMinusBasePitch;
  int16_t  vectorAngle;
  uint16_t topSeq;
  uint8_t  status;             // bit0=topConnected, bit1=sensingEnabled, bit2=zeroReady
};
// sizeof(MastPayload) = 17 bytes

// ESP-NOW packet: header(4) + counter(2) + payload(17) + padding(3) + chksum(2) = 28 bytes
using MastPacket = PacketTemplate<MastPayload, 3>;
static_assert(sizeof(MastPacket) == 28, "MastPacket must be 28 bytes");

uint32_t MAST_HEADER;
uint16_t mastCounter = 1;

// =======================
// STREAM 2: POWER SENSOR (I2C -> ESP-NOW, header "SENS")
// =======================

struct __attribute__((packed)) SensorPowerPayload {
  float shuntvoltage;   // 4 bytes
  float busvoltage;     // 4 bytes
  float current_mA;     // 4 bytes
  float loadvoltage;    // 4 bytes
  float power_mW;       // 4 bytes
};
// sizeof(SensorPowerPayload) = 20 bytes

// ESP-NOW packet: header(4) + counter(2) + payload(20) + padding(0) + chksum(2) = 28 bytes
using SensorPowerPacket = PacketTemplate<SensorPowerPayload, 0>;
static_assert(sizeof(SensorPowerPacket) == 28, "SensorPowerPacket must be 28 bytes");

uint32_t SENS_HEADER;
uint16_t sensCounter = 1;

Adafruit_INA219 ina219;
bool ina219Available = false;
uint32_t lastPowerRead = 0;
const uint32_t POWER_INTERVAL_MS = 1000;  // 1 Hz

// =======================
// ESP-NOW CALLBACKS
// =======================

void onESPNowSent(const esp_now_send_info_t *info, esp_now_send_status_t status) {
#if SHOW_SUCCESS
  if (status == ESP_NOW_SEND_SUCCESS) Serial.println("ESP-NOW: Delivered");
#endif
  if (status != ESP_NOW_SEND_SUCCESS) {
#if LOGGING
    Serial.println("ESP-NOW: Delivery fail");
#endif
  }
}

// Command reception from master node via ESP-NOW.
// Master sends raw ASCII bytes (e.g., "START", "STOP", "ZERO", "RESET_ZERO").
static volatile bool pendingCommand = false;
static char commandBuffer[32];
static size_t commandLength = 0;

void onESPNowRecv(const esp_now_recv_info_t *info, const uint8_t *incomingData, int len) {
  if (len <= 0 || len > 30) return;

  memcpy(commandBuffer, incomingData, len);
  commandBuffer[len] = '\0';
  commandLength = len;
  pendingCommand = true;

#if LOGGING
  Serial.printf("ESP-NOW cmd recv: %s\n", commandBuffer);
#endif
}

bool init_ESP_NOW() {
  if (esp_now_init() != ESP_OK) {
#if LOGGING
    Serial.println("ESP-NOW: Init failed");
#endif
    return false;
  }

  esp_now_register_send_cb(onESPNowSent);
  esp_now_register_recv_cb(onESPNowRecv);

  memset(&peerInfo, 0, sizeof(peerInfo));
  memcpy(peerInfo.peer_addr, receiverAddr, 6);
  peerInfo.channel = 0;
  peerInfo.encrypt = false;

  if (esp_now_add_peer(&peerInfo) != ESP_OK) {
#if LOGGING
    Serial.println("ESP-NOW: Failed to add master peer");
#endif
    return false;
  }

#if LOGGING
  Serial.println("ESP-NOW: Init OK");
#endif
  return true;
}

// =======================
// BLE CLIENT (connects to nRF52840 base bridge)
// =======================

static const char *TARGET_DEVICE_NAME = "XIAO_BASE_AUTO";

static BLEUUID serviceUUID("7A100000-3E2D-4B6A-9F10-112233445566");
static BLEUUID telemetryUUID("7A100001-3E2D-4B6A-9F10-112233445566");
static BLEUUID commandUUID("7A100002-3E2D-4B6A-9F10-112233445566");
static BLEUUID statusUUID("7A100003-3E2D-4B6A-9F10-112233445566");

static bool doConnect = false;
static bool bleConnected = false;
static bool doScan = true;

static BLEAdvertisedDevice *targetDevice = nullptr;
static BLEClient *bleClient = nullptr;
static BLERemoteCharacteristic *telemetryRemoteChar = nullptr;
static BLERemoteCharacteristic *statusRemoteChar = nullptr;
static BLERemoteCharacteristic *commandRemoteChar = nullptr;

static const uint32_t BLE_RECONNECT_MS = 5000;
static uint32_t lastScanAttempt = 0;

// BLE telemetry callback: wraps in ESP-NOW packet and sends immediately
static void telemetryNotifyCallback(
  BLERemoteCharacteristic *pBLERemoteCharacteristic,
  uint8_t *pData,
  size_t length,
  bool isNotify) {

  if (length != sizeof(MastPayload)) {
#if LOGGING
    Serial.printf("[BLE] Bad telemetry size: %d\n", length);
#endif
    return;
  }

  MastPacket pkt;
  clearPacket(pkt);
  memcpy(&pkt.payload, pData, sizeof(MastPayload));
  finalizePacket(pkt, MAST_HEADER, mastCounter);
  incrementCounter(mastCounter);
  sendPacket(pkt);

#if LOGGING
  MastPayload *t = (MastPayload *)pData;
  Serial.printf("[MAST #%u] bR=%d bP=%d tR=%d tP=%d vA=%d seq=%u\n",
    mastCounter - 1, t->baseRoll, t->basePitch, t->topRoll, t->topPitch,
    t->vectorAngle, t->topSeq);
#endif
}

static void statusNotifyCallback(
  BLERemoteCharacteristic *pBLERemoteCharacteristic,
  uint8_t *pData,
  size_t length,
  bool isNotify) {
#if LOGGING
  char buf[164];
  size_t copyLen = (length < 163) ? length : 163;
  memcpy(buf, pData, copyLen);
  buf[copyLen] = '\0';
  Serial.printf("[BLE STATUS] %s\n", buf);
#endif
}

class ClientCallbacks : public BLEClientCallbacks {
  void onConnect(BLEClient *pclient) override {
    bleConnected = true;
#if LOGGING
    Serial.println("BLE: Connected to base bridge");
#endif
  }
  void onDisconnect(BLEClient *pclient) override {
    bleConnected = false;
    telemetryRemoteChar = nullptr;
    commandRemoteChar = nullptr;
    statusRemoteChar = nullptr;
#if LOGGING
    Serial.println("BLE: Disconnected");
#endif
    doScan = true;
  }
};

class ScanCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    if (advertisedDevice.haveName() && advertisedDevice.getName() == TARGET_DEVICE_NAME) {
#if LOGGING
      Serial.printf("BLE: Found %s\n", advertisedDevice.toString().c_str());
#endif
      BLEDevice::getScan()->stop();
      targetDevice = new BLEAdvertisedDevice(advertisedDevice);
      doConnect = true;
      doScan = false;
    }
  }
};

bool connectToBridge() {
  if (targetDevice == nullptr) return false;

#if LOGGING
  Serial.printf("BLE: Connecting to %s\n", targetDevice->getAddress().toString().c_str());
#endif

  bleClient = BLEDevice::createClient();
  bleClient->setClientCallbacks(new ClientCallbacks());

  if (!bleClient->connect(targetDevice)) {
#if LOGGING
    Serial.println("BLE: Connect failed");
#endif
    return false;
  }

  BLERemoteService *svc = bleClient->getService(serviceUUID);
  if (svc == nullptr) {
#if LOGGING
    Serial.println("BLE: Service not found");
#endif
    bleClient->disconnect();
    return false;
  }

  // Telemetry (notify)
  telemetryRemoteChar = svc->getCharacteristic(telemetryUUID);
  if (telemetryRemoteChar != nullptr && telemetryRemoteChar->canNotify()) {
    telemetryRemoteChar->registerForNotify(telemetryNotifyCallback);
#if LOGGING
    Serial.println("BLE: Subscribed to telemetry");
#endif
  }

  // Status (notify)
  statusRemoteChar = svc->getCharacteristic(statusUUID);
  if (statusRemoteChar != nullptr && statusRemoteChar->canNotify()) {
    statusRemoteChar->registerForNotify(statusNotifyCallback);
  }

  // Command (write)
  commandRemoteChar = svc->getCharacteristic(commandUUID);

  bleConnected = true;
  return true;
}

void startBleScan() {
#if LOGGING
  Serial.println("BLE: Scanning...");
#endif
  BLEScan *scan = BLEDevice::getScan();
  scan->setAdvertisedDeviceCallbacks(new ScanCallbacks());
  scan->setInterval(1349);
  scan->setWindow(449);
  scan->setActiveScan(true);
  scan->start(5, false);
}

// =======================
// COMMAND FORWARDING (ESP-NOW -> BLE)
// =======================

void forwardPendingCommand() {
  if (!pendingCommand) return;
  pendingCommand = false;

  if (!bleConnected || commandRemoteChar == nullptr) {
#if LOGGING
    Serial.println("CMD dropped: BLE not connected");
#endif
    return;
  }

  commandRemoteChar->writeValue((uint8_t *)commandBuffer, commandLength);
#if LOGGING
  Serial.printf("CMD >> BLE: %s\n", commandBuffer);
#endif
}

// Serial commands for local debugging
void checkSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd.length() == 0) return;

  if (bleConnected && commandRemoteChar != nullptr) {
#if LOGGING
    Serial.printf("[SERIAL >> BLE] %s\n", cmd.c_str());
#endif
    commandRemoteChar->writeValue(cmd.c_str(), cmd.length());
  } else {
#if LOGGING
    Serial.println("Serial cmd ignored: BLE not connected");
#endif
  }
}

// =======================
// POWER SENSOR READING
// =======================

void readAndSendPower() {
  if (!ina219Available) return;

  uint32_t now = millis();
  if (now - lastPowerRead < POWER_INTERVAL_MS) return;
  lastPowerRead = now;

  SensorPowerPacket pkt;
  clearPacket(pkt);

  pkt.payload.shuntvoltage = ina219.getShuntVoltage_mV();
  pkt.payload.busvoltage   = ina219.getBusVoltage_V();
  pkt.payload.current_mA   = ina219.getCurrent_mA();
  pkt.payload.power_mW     = ina219.getPower_mW();
  pkt.payload.loadvoltage  = pkt.payload.busvoltage + (pkt.payload.shuntvoltage / 1000.0f);

  finalizePacket(pkt, SENS_HEADER, sensCounter);
  incrementCounter(sensCounter);
  sendPacket(pkt);

#if LOGGING
  Serial.printf("[SENS #%u] V=%.2f I=%.1fmA P=%.0fmW\n",
    sensCounter - 1, pkt.payload.loadvoltage, pkt.payload.current_mA, pkt.payload.power_mW);
#endif
}

// =======================
// SETUP
// =======================

void setup() {
  Serial.begin(115200);
  delay(500);

#if LOGGING
  Serial.println();
  Serial.println("================================================");
  Serial.println("  Combined Node: Mast BLE + Power Sensor");
  Serial.println("  ESP-NOW headers: MAST / SENS");
  Serial.println("================================================");
  Serial.println();
#endif

  // --- WiFi + ESP-NOW ---
  WiFi.mode(WIFI_STA);

#if LOGGING
  Serial.printf("MAC: %s\n", WiFi.macAddress().c_str());
#endif

  while (!init_ESP_NOW()) {
    delay(100);
  }

  // Set packet headers
  char mastRole[4] = { 'M', 'A', 'S', 'T' };
  MAST_HEADER = str_to_u32(mastRole);

  char sensRole[4] = { 'S', 'E', 'N', 'S' };
  SENS_HEADER = str_to_u32(sensRole);

#if LOGGING
  Serial.printf("MAST header: 0x%08X  packet: %d bytes\n", MAST_HEADER, sizeof(MastPacket));
  Serial.printf("SENS header: 0x%08X  packet: %d bytes\n", SENS_HEADER, sizeof(SensorPowerPacket));
#endif

  // --- I2C + INA219 (non-blocking: continues if not found) ---
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  if (ina219.begin()) {
    ina219.setCalibration_32V_2A();
    ina219Available = true;
#if LOGGING
    Serial.println("INA219: OK");
#endif
  } else {
    ina219Available = false;
#if LOGGING
    Serial.println("INA219: Not found (power stream disabled)");
#endif
  }

  // --- BLE Client (non-blocking: continues if not found) ---
  BLEDevice::init("ESP32_COMBINED_NODE");
  startBleScan();

#if LOGGING
  Serial.printf("BLE target: %s\n", TARGET_DEVICE_NAME);
  Serial.println();
  Serial.println("Commands (ESP-NOW from master or Serial):");
  Serial.println("  START | STOP | ZERO | RESET_ZERO");
  Serial.println();
  Serial.println("=== Setup complete ===\n");
#endif
}

// =======================
// LOOP
// =======================

void loop() {
  // --- BLE connection management ---
  if (doConnect) {
    if (connectToBridge()) {
#if LOGGING
      Serial.println("BLE: Connected & subscribed. MAST stream active.");
#endif
    } else {
#if LOGGING
      Serial.println("BLE: Connect failed, will retry.");
#endif
      doScan = true;
    }
    doConnect = false;
  }

  // Re-scan BLE if disconnected
  if (!bleConnected && doScan && millis() - lastScanAttempt > BLE_RECONNECT_MS) {
    lastScanAttempt = millis();
    startBleScan();
  }

  // --- Power sensor (independent of BLE state) ---
  readAndSendPower();

  // --- Forward commands from master to nRF52840 ---
  forwardPendingCommand();

  // --- Local serial commands ---
  checkSerialCommands();

  delay(10);
}
