#include <HardwareSerial.h>

/*
   This sample code demonstrates the normal use of a TinyGPSPlus (TinyGPSPlus) object.
   It requires the use of SoftwareSerial, and assumes that you have a
   4800-baud serial GPS device hooked up on pins 4(rx) and 3(tx).
 */
static const int RXPin = 20, TXPin = 21;
static const uint32_t GPSBaud = 9600;

// The TinyGPSPlus object

// The serial connection to the GPS device
HardwareSerial ss(1);

void setup() {
  ss.begin(GPSBaud, SERIAL_8N1, RXPin, TXPin);
	ss.begin(GPSBaud);
	Serial.begin(115200);
	
	
}

void loop() {
	while (ss.available()) {
    char c = ss.read();
    Serial.write(c);
  }
}
