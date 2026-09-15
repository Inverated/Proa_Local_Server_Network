#define RX_PIN 4
#define TX_PIN 5

HardwareSerial MySerial(1);

void setup() {
  Serial.begin(9600);

  MySerial.begin(
    9600,
    SERIAL_8N1,
    RX_PIN,
    TX_PIN
  );

  Serial.println("UART RX monitor started");
}

void loop() {
  while (MySerial.available()) {
    uint8_t b = MySerial.read();

    Serial.print("RX: 0x");
    if (b < 0x10) Serial.print("0");
    Serial.print(b, HEX);

    Serial.print("  DEC: ");
    Serial.print(b);

    Serial.print("  CHAR: ");
    if (b >= 32 && b <= 126)
      Serial.write(b);
    else
      Serial.print(".");

    Serial.println();
  }
}
