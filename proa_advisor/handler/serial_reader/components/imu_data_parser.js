/*
struct __attribute__((packed)) PacketTemplate {
  uint32_t header;
  uint16_t counter;
  PayloadT payload;
  uint8_t padding[PAD_BYTES];
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

function checksum16Bytes(buf) {
    let sum = 0;

    for (let i = 0; i < buf.length; i++) {
        sum = ((sum << 1) ^ buf[i] ^ (sum >>> 15)) & 0xFFFF;
    }

    return sum;
}

function parseTelemetryData(recvBuf, packet_bytes, packetSkipped = 0) {
    const counter = recvBuf.readUInt16LE(4);
    const baseRoll = recvBuf.readInt16LE(6);
    const basePitch = recvBuf.readInt16LE(8);
    const topRoll = recvBuf.readInt16LE(10);
    const topPitch = recvBuf.readInt16LE(12);
    const topMinusBaseRoll = recvBuf.readInt16LE(14);
    const topMinusBasePitch = recvBuf.readInt16LE(16);
    const topSeq = recvBuf.readUInt16LE(18);
    const chksum = recvBuf.readUInt16LE(26);

    const checksumCalBuffer = recvBuf.subarray(4, 26);

    if (chksum !== checksum16Bytes(checksumCalBuffer)) {
        console.warn(`Checksum fail at counter ${counter}. Re-syncing.`);
        recvBuf = recvBuf.subarray(1);
        return null;
    }
    // Process the telemetry data as needed

    
    return recvBuf.subarray(packet_bytes); // Return the remaining buffer after processing the packet
}

module.exports = {
    parseTelemetryData
}