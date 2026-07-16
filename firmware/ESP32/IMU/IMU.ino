#include <ArduinoBLE.h>
#include <LSM6DS3.h>
#include <Wire.h>
#include <math.h>

LSM6DS3 myIMU(I2C_MODE, 0x6A);

BLEService imuService("19B10010-E8F2-537E-4F6C-D104768A1214");
BLECharacteristic angleCharacteristic(
  "19B10011-E8F2-537E-4F6C-D104768A1214",
  BLERead | BLENotify,
  32
);

struct AnglePacket {
  float roll;
  float pitch;
};

void computeRollPitch(float ax, float ay, float az, float &roll, float &pitch) {
  roll  = atan2(ay, az) * 180.0f / PI;
  pitch = atan2(-ax, sqrt(ay * ay + az * az)) * 180.0f / PI;
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  if (myIMU.begin() != 0) {
    while (1) {}
  }

  if (!BLE.begin()) {
    while (1) {}
  }

  BLE.setLocalName("XIAO_TOP_IMU");
  BLE.setAdvertisedService(imuService);
  imuService.addCharacteristic(angleCharacteristic);
  BLE.addService(imuService);

  AnglePacket pkt = {0.0f, 0.0f};
  angleCharacteristic.writeValue((uint8_t*)&pkt, sizeof(pkt));

  BLE.advertise();
}

void loop() {
  BLE.poll();

  float ax = myIMU.readFloatAccelX();
  float ay = myIMU.readFloatAccelY();
  float az = myIMU.readFloatAccelZ();

  AnglePacket pkt;
  computeRollPitch(ax, ay, az, pkt.roll, pkt.pitch);

  angleCharacteristic.writeValue((uint8_t*)&pkt, sizeof(pkt));
  delay(100);
}