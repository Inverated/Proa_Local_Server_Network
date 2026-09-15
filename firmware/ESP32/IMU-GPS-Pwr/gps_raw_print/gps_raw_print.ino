#include <Arduino.h>

HardwareSerial GPS(1);

#define GPS_RX 20  // Connect to GPS TX
#define GPS_TX 21  // Connect to GPS RX

void setup() {
  Serial.begin(115200);                 // Serial Monitor baud rate
  GPS.begin(9600, SERIAL_8N1, GPS_RX, GPS_TX); // Try 9600 first

  Serial.println("GPS raw data:");
}

void loop() {
  while (GPS.available()) {
    Serial.write(GPS.read());
  }
}