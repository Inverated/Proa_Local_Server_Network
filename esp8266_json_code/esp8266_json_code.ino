#include <ESP8266WiFi.h>
#include <ArduinoJson.h>


void setup() {
  // put your setup code here, to run once:
  Serial.begin(115200);
}

void loop() {
  // put your main code here, to run repeatedly:
  StaticJsonDocument<300> doc;
  doc["macaddress"] = WiFi.macAddress();
  doc["role"] = "Power Tracker";
  
  String output;
  serializeJson(doc, output);
  Serial.println(output);

  delay(200);
}
