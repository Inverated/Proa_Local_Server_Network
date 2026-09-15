const { write_to_clients } = require("../../client_transmission");

function checksum16Bytes(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        sum = ((sum << 1) ^ buf[i] ^ (sum >>> 15)) & 0xFFFF;
    }
    return sum;
}

/*
GPS Data structure:
struct __attribute__((packed)) PacketTemplate {
  uint32_t header;
  uint16_t counter;
  PayloadT payload;
  uint8_t padding[PAD_BYTES];   // 0 as the total packet size adds up to exactly 28 bytes
  uint16_t chksum;
};

struct __attribute__((packed)) GPSPayload {
  int32_t latitude;    // fixed-point ×1e7
  int32_t longitude;   // fixed-point ×1e7
  int16_t altitude;    // meters
  uint16_t speed;      // km/h
  uint16_t course;     // degrees ×100
  uint16_t hdop;       // cm
  uint8_t satellites;  // number of satellites
};
// Total size = 4+4+2+2+2+2+1 = 17 bytes
*/
function parseGPSData(recvBuf, packet_bytes, packetSkipped = 0) {
    const counter = recvBuf.readUInt16LE(4);
    const latitude = recvBuf.readInt32LE(6) / 1e7; // Convert from fixed-point to degrees
    const longitude = recvBuf.readInt32LE(10) / 1e7;
    const altitude = recvBuf.readInt16LE(14);
    const speed = recvBuf.readUInt16LE(16);
    const course = recvBuf.readUInt16LE(18) / 100;
    const hdop = recvBuf.readUInt16LE(20) / 100; // Convert from cm to meters
    const satellites = recvBuf.readUInt8(22);
    const padding = recvBuf.readUInt8(23); // Padding byte, should be 0
    const chksum = recvBuf.readUInt16LE(26);

    const checksumBuf = recvBuf.subarray(4, 26); // Checksum covers counter, payload, and padding
    if (recvBuf[23] !== 0 || recvBuf[24] !== 0 || recvBuf[25] !== 0) {
        console.warn(`[GPS] Padding byte is not zero at counter ${counter}. Re-syncing.`);
        return null;
    }
    if (chksum !== checksum16Bytes(checksumBuf)) {
        console.warn(`[GPS] Checksum fail. Re-syncing.`);
        return null;
    }

    const valid = Number.isFinite(latitude)
        && Number.isFinite(longitude)
        && latitude >= -90
        && latitude <= 90
        && longitude >= -180
        && longitude <= 180
        && satellites > 0
        && !(latitude === 0 && longitude === 0);

    const telemetry = {
        counter,
        latitude,
        longitude,
        altitude,
        speed,
        course,
        hdop,
        satellites,
        valid,
        recv_ms: Date.now()
    };

    if (!valid) {
        console.warn(`[GPS] No valid fix at counter ${counter}; skipped packets: ${packetSkipped}`);
    }
    write_to_clients("gps", telemetry);

    return recvBuf.subarray(packet_bytes); // Return the remaining buffer after processing the packet
}


module.exports = {
    parseGPSData
};