/*
Packet layout (28 bytes total):

struct __attribute__((packed)) StrainPacket {
  uint32_t header;          // offset 0,  4 bytes  ("STRN" as LE uint32)
  uint16_t counter;         // offset 4,  2 bytes
  StrainPayload payload;    // offset 6,  4 bytes
  uint8_t padding[16];      // offset 10, 16 bytes
  uint16_t chksum;          // offset 26, 2 bytes
};

struct __attribute__((packed)) StrainPayload {
  int32_t adjustedReading;  // offset 6,  4 bytes (raw ADC minus zero offset)
};

Checksum scope: bytes 0..25 (everything except the chksum field itself).
*/

const { write_to_clients } = require('../../client_transmission');

function checksum16Bytes(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        sum = ((sum << 1) ^ buf[i] ^ (sum >>> 15)) & 0xFFFF;
    }
    return sum;
}

function parseStrainData(recvBuf, packet_bytes, packetSkipped = 0) {
    const counter = recvBuf.readUInt16LE(4);
    const adjustedReading = recvBuf.readInt32LE(6);
    const chksum = recvBuf.readUInt16LE(26);

    // Checksum validation: covers bytes 0..25 (everything except chksum)
    const checksumBuf = recvBuf.subarray(0, 26);
    if (chksum !== checksum16Bytes(checksumBuf)) {
        console.warn(`[STRAIN] Checksum fail at counter ${counter}. Re-syncing.`);
        return null;
    }

    const telemetry = {
        counter,
        adjustedReading
    };

    write_to_clients("strain", telemetry);

    return recvBuf.subarray(packet_bytes);
}

module.exports = { parseStrainData };
