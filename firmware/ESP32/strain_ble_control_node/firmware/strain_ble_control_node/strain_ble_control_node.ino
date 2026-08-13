#include <Arduino.h>
#include <Wire.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Preferences.h>
#include <SparkFun_Qwiic_Scale_NAU7802_Arduino_Library.h>

// ---------- Hardware pins from your schematic ----------
static constexpr uint8_t I2C_SDA_PIN = 21;
static constexpr uint8_t I2C_SCL_PIN = 22;

// ---------- BLE UUIDs ----------
static const char *DEVICE_NAME   = "StrainNode-ESP32";
static const char *SERVICE_UUID  = "7f4d1000-6f29-4ab8-89f7-6f4fb0f9b201";
static const char *CTRL_UUID     = "7f4d1001-6f29-4ab8-89f7-6f4fb0f9b201"; // write commands
static const char *DATA_UUID     = "7f4d1002-6f29-4ab8-89f7-6f4fb0f9b201"; // notify readings
static const char *STATUS_UUID   = "7f4d1003-6f29-4ab8-89f7-6f4fb0f9b201"; // read/notify state

Preferences prefs;
NAU7802 scale;

BLEServer *bleServer = nullptr;
BLECharacteristic *dataChar = nullptr;
BLECharacteristic *statusChar = nullptr;

bool bleClientConnected = false;
bool sensingEnabled = false;
uint8_t currentRate = NAU7802_SPS_20;
unsigned long lastStatusPushMs = 0;

String buildStatusLine() {
  String s = "connected=";
  s += bleClientConnected ? "1" : "0";
  s += ",enabled=";
  s += sensingEnabled ? "1" : "0";
  s += ",rate=";
  switch (currentRate) {
    case NAU7802_SPS_10:  s += "10"; break;
    case NAU7802_SPS_20:  s += "20"; break;
    case NAU7802_SPS_40:  s += "40"; break;
    case NAU7802_SPS_80:  s += "80"; break;
    case NAU7802_SPS_320: s += "320"; break;
    default: s += "?"; break;
  }
  s += ",zero=";
  s += String(scale.getZeroOffset());
  return s;
}

void pushStatus() {
  if (!statusChar) return;
  String msg = buildStatusLine();
  statusChar->setValue(msg.c_str());
  if (bleClientConnected) {
    statusChar->notify();
  }
}

bool setRateFromHz(int hz) {
  uint8_t rate = currentRate;
  switch (hz) {
    case 10:  rate = NAU7802_SPS_10; break;
    case 20:  rate = NAU7802_SPS_20; break;
    case 40:  rate = NAU7802_SPS_40; break;
    case 80:  rate = NAU7802_SPS_80; break;
    case 320: rate = NAU7802_SPS_320; break;
    default:  return false;
  }

  if (!scale.setSampleRate(rate)) {
    return false;
  }

  currentRate = rate;
  prefs.putUInt("rate", hz);
  pushStatus();
  return true;
}

void setSensingEnabled(bool enabled) {
  sensingEnabled = enabled;
  prefs.putBool("enabled", enabled);
  pushStatus();
}

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) override {
    bleClientConnected = true;
    pushStatus();
    Serial.println("BLE client connected");
  }

  void onDisconnect(BLEServer *pServer) override {
    bleClientConnected = false;
    Serial.println("BLE client disconnected");
    delay(100);
    BLEDevice::startAdvertising();
  }
};

class ControlCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    std::string rx = characteristic->getValue();
    if (rx.empty()) return;

    String cmd = String(rx.c_str());
    cmd.trim();
    cmd.toUpperCase();

    Serial.print("CTRL command: ");
    Serial.println(cmd);

    if (cmd == "START") {
      setSensingEnabled(true);
      return;
    }

    if (cmd == "STOP") {
      setSensingEnabled(false);
      return;
    }

    if (cmd == "TARE") {
      scale.calculateZeroOffset(16, 2000);
      prefs.putLong("zero", scale.getZeroOffset());
      pushStatus();
      return;
    }

    if (cmd == "STATUS") {
      pushStatus();
      return;
    }

    if (cmd.startsWith("RATE:")) {
      int hz = cmd.substring(5).toInt();
      setRateFromHz(hz);
      return;
    }
  }
};

void setupBle() {
  BLEDevice::init(DEVICE_NAME);
  bleServer = BLEDevice::createServer();
  bleServer->setCallbacks(new ServerCallbacks());

  BLEService *service = bleServer->createService(SERVICE_UUID);

  BLECharacteristic *ctrlChar = service->createCharacteristic(
      CTRL_UUID,
      BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  ctrlChar->setCallbacks(new ControlCallbacks());

  dataChar = service->createCharacteristic(
      DATA_UUID,
      BLECharacteristic::PROPERTY_NOTIFY);
  dataChar->addDescriptor(new BLE2902());

  statusChar = service->createCharacteristic(
      STATUS_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  statusChar->addDescriptor(new BLE2902());
  statusChar->setValue("booting");

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
}

void setupScale() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  if (!scale.begin(Wire, true)) {
    Serial.println("NAU7802 not detected. Check SDA/SCL/power.");
    while (true) {
      delay(1000);
    }
  }

  scale.setLDO(NAU7802_LDO_3V3);
  scale.setGain(NAU7802_GAIN_128);

  uint32_t storedRateHz = prefs.getUInt("rate", 20);
  if (!setRateFromHz((int)storedRateHz)) {
    setRateFromHz(20);
  }

  scale.calibrateAFE(NAU7802_CALMOD_INTERNAL);

  long storedZero = prefs.getLong("zero", 0);
  if (storedZero != 0) {
    scale.setZeroOffset(storedZero);
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println();
  Serial.println("Booting StrainNode-ESP32");

  prefs.begin("strainnode", false);
  sensingEnabled = prefs.getBool("enabled", false);

  setupScale();
  setupBle();
  pushStatus();

  Serial.println("Ready. Use BLE control commands: START, STOP, TARE, STATUS, RATE:<10|20|40|80|320>");
}

void loop() {
  if (sensingEnabled && bleClientConnected && scale.available()) {
    int32_t raw = scale.getReading();
    int32_t adjusted = raw - scale.getZeroOffset();

    char payload[20];
    snprintf(payload, sizeof(payload), "%ld", (long)adjusted);
    dataChar->setValue((uint8_t *)payload, strlen(payload));
    dataChar->notify();
  }

  if (millis() - lastStatusPushMs > 3000) {
    lastStatusPushMs = millis();
    pushStatus();
  }

  delay(2);
}
