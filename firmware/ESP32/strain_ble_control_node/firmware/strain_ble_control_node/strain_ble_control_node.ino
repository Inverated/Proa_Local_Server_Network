#include <Arduino.h>
#include <Wire.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <WiFi.h>
#include <Preferences.h>
#include <SparkFun_Qwiic_Scale_NAU7802_Arduino_Library.h>

// ---------- Hardware pins ----------
static constexpr uint8_t I2C_SDA_PIN = 21;
static constexpr uint8_t I2C_SCL_PIN = 22;

// ---------- Debug ----------
#define SHOW_SUCCESS  0
#define LOGGING       0
// =======================
// ESP-NOW CONFIG
// =======================

// Master node MAC address
uint8_t receiverAddr[] = { 0xac, 0xeb, 0xe6, 0x49, 0xc7, 0xcc };

esp_now_peer_info_t peerInfo;

// =======================
// PACKET TEMPLATE (from template_sender_firmware)
// =======================

uint32_t str_to_u32(const char s[4]) {
  return ((uint32_t)s[3] << 24) |
         ((uint32_t)s[2] << 16) |
         ((uint32_t)s[1] << 8)  |
         ((uint32_t)s[0]);
}

uint16_t checksum16_bytes(const uint8_t *data, size_t len) {
  uint16_t sum = 0;
  for (size_t i = 0; i < len; i++) {
    sum = (uint16_t)((sum << 1) ^ data[i] ^ (sum >> 15));
  }
  return sum;
}

template <typename PayloadT, size_t PAD_BYTES = 0>
struct __attribute__((packed)) PacketTemplate {
  uint32_t header;
  uint16_t counter;
  PayloadT payload;
  uint8_t padding[PAD_BYTES];
  uint16_t chksum;
};

template <typename PacketT>
void clearPacket(PacketT &pkt) {
  memset(&pkt, 0, sizeof(pkt));
}

template <typename PacketT>
void finalizePacket(PacketT &pkt, uint32_t header, uint16_t counter) {
  pkt.header = header;
  pkt.counter = counter;
  pkt.chksum = checksum16_bytes(
    (const uint8_t *)&pkt,
    sizeof(pkt) - sizeof(pkt.chksum)
  );
}

template <typename PacketT>
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

void incrementCounter(uint16_t &counter) {
  if (counter == 65535) {
    counter = 1;
  } else {
    counter++;
  }
}

// =======================
// STRAIN PAYLOAD
// =======================

// 4 bytes payload + 16 bytes padding = 20 bytes data region
// Total: header(4) + counter(2) + payload(4) + padding(16) + chksum(2) = 28 bytes
struct __attribute__((packed)) StrainPayload {
  int32_t adjustedReading;  // raw ADC minus zero offset
};

using StrainPacket = PacketTemplate<StrainPayload, 16>;

uint32_t STRAIN_HEADER;
uint16_t strainCounter = 1;

// =======================
// ESP-NOW CALLBACKS
// =======================

void onESPNowSent(const wifi_tx_info_t *tx_info, esp_now_send_status_t status) {
#if SHOW_SUCCESS
  if (status == ESP_NOW_SEND_SUCCESS) {
    Serial.println("Delivery Success");
  }
#endif
  if (status != ESP_NOW_SEND_SUCCESS) {
    Serial.println("Delivery Fail");
  }
}

// =======================
// SCALE & STATE
// =======================

Preferences prefs;
NAU7802 scale;

bool sensingEnabled = false;
uint8_t currentRate = NAU7802_SPS_20;

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
  return true;
}

// =======================
// COMMAND RECEPTION (from master node)
// =======================

void OnDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *data, int len) {
  String cmd = String((char *)data, len);
  cmd.trim();
  cmd.toUpperCase();

  Serial.print("CMD received: ");
  Serial.println(cmd);

  if (cmd == "START") {
    sensingEnabled = true;
    prefs.putBool("enabled", true);
  } else if (cmd == "STOP") {
    sensingEnabled = false;
    prefs.putBool("enabled", false);
  } else if (cmd == "TARE") {
    scale.calculateZeroOffset(16, 2000);
    prefs.putLong("zero", scale.getZeroOffset());
  } else if (cmd.startsWith("RATE:")) {
    int hz = cmd.substring(5).toInt();
    setRateFromHz(hz);
  }
}

// =======================
// ESP-NOW SETUP
// =======================

bool init_ESP_NOW() {
  if (esp_now_init() != ESP_OK) {
    Serial.println("ESP-NOW failed to initialise");
    return false;
  }

  esp_now_register_send_cb(onESPNowSent);
  esp_now_register_recv_cb(OnDataRecv);

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

// =======================
// SCALE SETUP
// =======================

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

// =======================
// SETUP
// =======================

void setup() {
  Serial.begin(115200);

  delay(500);
  WiFi.mode(WIFI_STA);

  delay(100);
  
  uint64_t mac = ESP.getEfuseMac();

  Serial.printf(
    "Base MAC: %04X%08X\n",
    (uint16_t)(mac >> 32),
    (uint32_t)mac
  );

  while (!init_ESP_NOW()) {
    delay(100);
  }

  prefs.begin("strainnode", false);
  sensingEnabled = prefs.getBool("enabled", true);

  setupScale();

  STRAIN_HEADER = str_to_u32("STRN");

  Serial.println("StrainNode ESP-NOW ready");
  Serial.print("Packet size: ");
  Serial.println(sizeof(StrainPacket));
}

// =======================
// LOOP
// =======================

void loop() {
  if (sensingEnabled && scale.available()) {
    int32_t raw = scale.getReading();
    int32_t adjusted = raw - scale.getZeroOffset();

    StrainPacket pkt;
    clearPacket(pkt);

    pkt.payload.adjustedReading = adjusted;

#if LOGGING
    Serial.print("Reading: ");
    Serial.println(adjusted);
#endif

    finalizePacket(pkt, STRAIN_HEADER, strainCounter);
    incrementCounter(strainCounter);

    sendPacket(pkt);
  }

  taskYIELD();
}
