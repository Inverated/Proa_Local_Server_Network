/*
struct __attribute__((packed)) PacketTemplate {
  uint32_t header;
  uint16_t counter;
  PayloadT payload;
  uint8_t padding[PAD_BYTES];   // 0 as the total packet size adds up to exactly 28 bytes
  uint16_t chksum;
};


struct __attribute__((packed)) Telemetry_Payload {
  int16_t baseRoll;
  int16_t basePitch;
  int16_t topRoll;
  int16_t topPitch;
  int16_t topMinusBaseRoll;
  int16_t topMinusBasePitch;
  uint16_t topSeq;
};

Padding size: 28 - 4 - 2 - 14 - 2 = 6 bytes
*/
