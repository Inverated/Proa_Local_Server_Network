#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>

// Seeed XIAO nRF52840 Sense IMU
LSM6DS3 myIMU(I2C_MODE, 0x6A);

// BLE service/characteristic for top node -> base node
BLEService imuService("19B10010-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic gravityCharacteristic(
  "19B10011-E8F2-537E-4F6C-D104768A1214",
  BLERead | BLENotify,
  sizeof(float) * 3 + sizeof(uint32_t)
);

struct GravityPacket {
  float gx;
  float gy;
  float gz;
  uint32_t seq;
};

// -------- Tuning --------
const uint32_t UPDATE_INTERVAL_MS = 50;     // 20 Hz BLE updates
const float FILTER_ALPHA = 0.93f;           // Higher = smoother but slower response
const float MIN_ACCEL_NORM = 0.70f;         // Reject samples during strong motion/vibration
const float MAX_ACCEL_NORM = 1.30f;

float fgx = 0.0f;
float fgy = 0.0f;
float fgz = 1.0f;
bool filterReady = false;
uint32_t seq = 0;
uint32_t lastUpdate = 0;

bool readNormalisedAccel(float &gx, float &gy, float &gz) {
  float ax = myIMU.readFloatAccelX();
  float ay = myIMU.readFloatAccelY();
  float az = myIMU.readFloatAccelZ();

  float n = sqrt(ax * ax + ay * ay + az * az);
  if (n < MIN_ACCEL_NORM || n > MAX_ACCEL_NORM) {
    return false;
  }

  gx = ax / n;
  gy = ay / n;
  gz = az / n;
  return true;
}

void updateGravityFilter() {
  float gx, gy, gz;
  if (!readNormalisedAccel(gx, gy, gz)) {
    return; // Hold previous filtered vector if acceleration is not gravity-like
  }

  if (!filterReady) {
    fgx = gx;
    fgy = gy;
    fgz = gz;
    filterReady = true;
    return;
  }

  fgx = FILTER_ALPHA * fgx + (1.0f - FILTER_ALPHA) * gx;
  fgy = FILTER_ALPHA * fgy + (1.0f - FILTER_ALPHA) * gy;
  fgz = FILTER_ALPHA * fgz + (1.0f - FILTER_ALPHA) * gz;

  float n = sqrt(fgx * fgx + fgy * fgy + fgz * fgz);
  if (n > 0.0001f) {
    fgx /= n;
    fgy /= n;
    fgz /= n;
  }
}

void writeGravityPacket() {
  GravityPacket pkt;
  pkt.gx = fgx;
  pkt.gy = fgy;
  pkt.gz = fgz;
  pkt.seq = seq++;

  gravityCharacteristic.writeValue((uint8_t *)&pkt, sizeof(pkt));

  Serial.print("TOP g: ");
  Serial.print(pkt.gx, 4);
  Serial.print(", ");
  Serial.print(pkt.gy, 4);
  Serial.print(", ");
  Serial.print(pkt.gz, 4);
  Serial.print(" seq=");
  Serial.println(pkt.seq);
}

void setup() {
  Serial.begin(115200);
  uint32_t serialStart = millis();
  while (!Serial && millis() - serialStart < 2000) {}

  Wire.begin();

  if (myIMU.begin() != 0) {
    Serial.println("Top IMU init failed");
    while (1) {}
  }

  // Prime the filter before advertising.
  for (int i = 0; i < 50; i++) {
    updateGravityFilter();
    delay(10);
  }

  if (!BLE.begin()) {
    Serial.println("BLE init failed");
    while (1) {}
  }

  BLE.setLocalName("XIAO_TOP_IMU");
  BLE.setDeviceName("XIAO_TOP_IMU");
  BLE.setAdvertisedService(imuService);

  imuService.addCharacteristic(gravityCharacteristic);
  BLE.addService(imuService);

  writeGravityPacket();
  BLE.advertise();
  Serial.println("Top node advertising");
}

void loop() {
  BLE.poll();

  if (millis() - lastUpdate >= UPDATE_INTERVAL_MS) {
    lastUpdate = millis();
    updateGravityFilter();
    writeGravityPacket();
  }
}
