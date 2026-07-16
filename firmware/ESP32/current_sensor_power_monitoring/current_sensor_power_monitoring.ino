#include <Wire.h>
#include <Adafruit_INA219.h>
#include <U8g2lib.h>
#include <MUIU8g2.h>

Adafruit_INA219 ina219;
#define SDA_PIN 0
#define SCL_PIN 1

U8G2_SSD1306_72X40_ER_F_SW_I2C u8g2(U8G2_R0, /* clock=*/6, /* data=*/5, /* reset=*/U8X8_PIN_NONE);

bool init_OLED() {
  u8g2.begin();
  u8g2.setFont(u8g2_font_ncenB08_tr);
  u8g2.setDrawColor(1); // White
  u8g2.clearBuffer();
  u8g2.drawStr(0, 10, "Hallo");
  u8g2.drawStr(0, 22, "wold");
  u8g2.sendBuffer();
  return true;
}

void setup() {
  Serial.begin(115200);
  init_OLED();
  Wire.begin(SDA_PIN, SCL_PIN);

  while (!ina219.begin()) {
    Serial.println("Failed to find");
    delay(1000);
  }

  ina219.setCalibration_32V_2A();
}

void loop() {
  float shuntvoltage = 0;
  float busvoltage = 0;
  float current_mA = 0;
  float loadvoltage = 0;
  float power_mW = 0;

  shuntvoltage = ina219.getShuntVoltage_mV();
  busvoltage = ina219.getBusVoltage_V();
  current_mA = ina219.getCurrent_mA();
  power_mW = ina219.getPower_mW();
  loadvoltage = busvoltage + (shuntvoltage / 1000);

  Serial.print("Bus Voltage:   "); Serial.print(busvoltage); Serial.println(" V");
  Serial.print("Shunt Voltage: "); Serial.print(shuntvoltage); Serial.println(" mV");
  Serial.print("Load Voltage:  "); Serial.print(loadvoltage); Serial.println(" V");
  Serial.print("Current:       "); Serial.print(current_mA); Serial.println(" mA");
  Serial.print("Power:         "); Serial.print(power_mW); Serial.println(" mW");
  Serial.println("");

  u8g2.clearBuffer();
  String v_message = "V:" + String(busvoltage, 2) + "V";
  u8g2.drawStr(0, 10, v_message.c_str());
  String A_message = "I:" + String(current_mA, 2) + "mA";
  u8g2.drawStr(0, 22, A_message.c_str());
  String P_message = "P:" + String(power_mW, 0) + "mW";
  u8g2.drawStr(0, 34, P_message.c_str());
  u8g2.sendBuffer();

  delay(1000);
}
