#include <Arduino.h>
#include <U8g2lib.h>
#include <MUIU8g2.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// This MAC Addr: ac:eb:e6:49:c7:cc

// Serial setup
#define BAUD_RATE 2000000
bool streamEnabled = false;
volatile uint32_t prev_tick;
volatile uint32_t last_received_tick;

// Only enable 1 at a time
#define LOGGING       1
#define TRANSMITTING  1

// ESP Now setup
#if LOGGING
uint32_t prev_time;
#endif

// Connected device
#define SEEN_TABLE_SIZE 16  // User power of 2 to use & operator

uint8_t last_count_displayed = 0;
uint8_t mac_addr_table[SEEN_TABLE_SIZE][6];
bool filled[SEEN_TABLE_SIZE];
volatile uint8_t total_seen = 0;

static inline uint32_t mac_hash(const uint8_t mac[6]) {
  uint32_t h;

  memcpy(&h, mac, 4);  // 4 bytes bulk load
  // MurmurHash algo
  h ^= ((uint32_t)mac[4] << 8) | mac[5];

  h ^= h >> 16;
  h *= 0x7feb352d;
  h ^= h >> 15;
  h *= 0x846ca68b;
  h ^= h >> 16;
  return h;
}

static volatile bool oled_to_update = false;

static inline int find_or_insert(const uint8_t mac[6]) {
  uint32_t hash_idx = mac_hash(mac) & (SEEN_TABLE_SIZE - 1);  // & and operator; 8 - 1 == b111

  for (int i = 0; i < SEEN_TABLE_SIZE; i++) {
    uint8_t pos = (hash_idx + i) & (SEEN_TABLE_SIZE - 1);
    if (!filled[pos]) {
      memcpy(mac_addr_table[pos], mac, 6);
      filled[pos] = true;
      total_seen += 1;
      oled_to_update = true;
      return pos;
    }

    if (memcmp(mac_addr_table[pos], mac, 6) == 0) {
      return pos;
    }
  }
  return -1;
}

void OnDataRecv(const esp_now_recv_info_t *recv_info, const uint8_t *incomingData, int len) {
  uint8_t mac_cpy[6];
  memcpy(mac_cpy, recv_info->src_addr, 6);

#if TRANSMITTING
  Serial.write(incomingData, len);
#endif

  find_or_insert(mac_cpy);  // Assuming the number of connection will always be less than set       //3a:93:ca:3f:34:93

#if LOGGING
  uint32_t now_us = micros();
  Serial.printf("Bytes received: %d; Time between packets: %d\n", len, now_us - prev_time);
  Serial.printf("Total connected: %d\n", total_seen);
  prev_time = now_us;
#endif
}

inline void checkForStart() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    if (cmd == "START") {
      Serial.println("ADC Ready");
      streamEnabled = true;
    }
  }
}

inline bool init_esp_now() {
  if (esp_now_init() != ESP_OK) {
    Serial.println("Error initializing ESP-NOW");
    return false;
  }

  esp_now_register_recv_cb(OnDataRecv);
  return true;
}

U8G2_SSD1306_72X40_ER_F_SW_I2C u8g2(U8G2_R0, /* clock=*/6, /* data=*/5, /* reset=*/U8X8_PIN_NONE);

inline bool init_OLED() {
  u8g2.begin();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.setDrawColor(1); // White
  u8g2.clearBuffer();

  u8g2.drawStr(0, 10, "Connected to");
  u8g2.drawStr(0, 22, "0  devices");
  u8g2.sendBuffer();
  return true;
}

inline void update_connected_dev(uint8_t count) {
  u8g2.setDrawColor(0);
  u8g2.drawBox(0, 10, 12, 12);
  u8g2.setDrawColor(1);

  char buf[16];
  sprintf(buf, "%d", count);
  u8g2.drawStr(0, 22, buf);
  u8g2.sendBuffer();
  last_count_displayed = count;
}

void setup() {
  Serial.begin(BAUD_RATE);
  WiFi.mode(WIFI_STA);

  init_OLED();
  
  while (!init_esp_now()) {
    delay(500);
  }


  Serial.println("Finished setup");
#if LOGGING
  prev_time = micros();
#endif
}

void loop() {
  TickType_t now_tick = xTaskGetTickCount();
  TickType_t last_tick = prev_tick;

  TickType_t elapsed = now_tick - last_tick;
  
  // Couldnt get interupt to work. On connect, will lose a few ms
  if (now_tick > last_tick && elapsed > pdMS_TO_TICKS(2000)) {
    memset(mac_addr_table, 0, sizeof(mac_addr_table));
    memset(filled, 0, sizeof(filled));
    total_seen = 0;
    prev_tick = now_tick;
  }


  if (oled_to_update) {
    update_connected_dev(total_seen);
    oled_to_update = false;
  }
  
  if (last_count_displayed != total_seen) {
    oled_to_update = true;
  }
  
  if (!streamEnabled) {
    // No longer stops transmiting result if not flagged
    // Still retain for handshake process
    checkForStart();
    return;
  }
}