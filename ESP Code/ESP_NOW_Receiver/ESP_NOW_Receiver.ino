#include <ESP8266WiFi.h>
#include <espnow.h>
#include <ArduinoJson.h>

String macAddr;

void setup() {
    Serial.begin(115200);
    WiFi.mode(WIFI_STA);
    macAddr = WiFi.macAddress();
    ESPNow.begin();
}

void loop() {
    StaticJsonDocument<300> doc;
    doc["stationMacAddr"] = macAddr;
    doc["transmittorMacAddr"] = "TEMP";
    doc["role"] = "Power Tracker";

    String output;
    serializeJson(doc, output);
    Serial.println(output);
    delay(200);
    // Update to print when receive esp now instead of delay
}
