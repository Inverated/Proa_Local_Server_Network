/*
Packet layout (28 bytes total):

struct __attribute__((packed)) PacketTemplate {
  uint32_t header;          // offset 0,  4 bytes  ("TELE" as LE uint32)
  uint16_t counter;         // offset 4,  2 bytes
  PayloadT payload;         // offset 6,  17 bytes (Telemetry_Payload)
  uint8_t padding[3];       // offset 23, 3 bytes
  uint16_t chksum;          // offset 26, 2 bytes
};

struct __attribute__((packed)) Telemetry_Payload {
  int16_t  baseRoll;           // offset 6,  2 bytes  (fixed-point x100)
  int16_t  basePitch;          // offset 8,  2 bytes
  int16_t  topRoll;            // offset 10, 2 bytes
  int16_t  topPitch;           // offset 12, 2 bytes
  int16_t  topMinusBaseRoll;   // offset 14, 2 bytes
  int16_t  topMinusBasePitch;  // offset 16, 2 bytes
  int16_t  vectorAngle;        // offset 18, 2 bytes
  uint16_t topSeq;             // offset 20, 2 bytes
  uint8_t  status;             // offset 22, 1 byte  (bit0=topConnected, bit1=sensingEnabled, bit2=zeroReady)
};                             // = 17 bytes

Checksum scope: bytes 4..25 (counter + payload + padding), excludes header and chksum fields.
*/

const ANGLE_SCALE = 100.0;

function checksum16Bytes(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        sum = ((sum << 1) ^ buf[i] ^ (sum >>> 15)) & 0xFFFF;
    }
    return sum;
}

function parseTelemetryData(recvBuf, packet_bytes, packetSkipped = 0) {
    // Read fields
    const counter = recvBuf.readUInt16LE(4);
    const baseRollRaw = recvBuf.readInt16LE(6);
    const basePitchRaw = recvBuf.readInt16LE(8);
    const topRollRaw = recvBuf.readInt16LE(10);
    const topPitchRaw = recvBuf.readInt16LE(12);
    const topMinusBaseRollRaw = recvBuf.readInt16LE(14);
    const topMinusBasePitchRaw = recvBuf.readInt16LE(16);
    const vectorAngleRaw = recvBuf.readInt16LE(18);
    const topSeq = recvBuf.readUInt16LE(20);
    const status = recvBuf.readUInt8(22);
    const chksum = recvBuf.readUInt16LE(26);

    // Checksum validation: covers bytes 4..25 (counter + payload + padding)
    const checksumCalBuffer = recvBuf.subarray(4, 26);
    if (chksum !== checksum16Bytes(checksumCalBuffer)) {
        console.warn(`[IMU] Checksum fail at counter ${counter}. Re-syncing.`);
        return null;
    }

    // Convert fixed-point to float (divide by 100)
    const baseRoll = baseRollRaw / ANGLE_SCALE;
    const basePitch = basePitchRaw / ANGLE_SCALE;
    const topRoll = topRollRaw / ANGLE_SCALE;
    const topPitch = topPitchRaw / ANGLE_SCALE;
    const topMinusBaseRoll = topMinusBaseRollRaw / ANGLE_SCALE;
    const topMinusBasePitch = topMinusBasePitchRaw / ANGLE_SCALE;
    const vectorAngle = vectorAngleRaw / ANGLE_SCALE;

    // Compute derived fields (server-side)
    const bendMagnitude = Math.sqrt(topMinusBaseRoll * topMinusBaseRoll + topMinusBasePitch * topMinusBasePitch);
    const baseMinusTopRoll = -topMinusBaseRoll;
    const baseMinusTopPitch = -topMinusBasePitch;

    // Unpack status bitfield
    const topConnected = !!(status & 0x01);
    const sensingEnabled = !!(status & 0x02);
    const zeroReady = !!(status & 0x04);

    const telemetry = {
        counter,
        baseRoll,
        basePitch,
        topRoll,
        topPitch,
        topMinusBaseRoll,
        topMinusBasePitch,
        vectorAngle,
        bendMagnitude,
        baseMinusTopRoll,
        baseMinusTopPitch,
        topSeq,
        topConnected,
        sensingEnabled,
        zeroReady
    };

    // Console output for testing/verification
    console.log(`[IMU] #${counter} bR=${baseRoll.toFixed(2)} bP=${basePitch.toFixed(2)} tR=${topRoll.toFixed(2)} tP=${topPitch.toFixed(2)} tmbR=${topMinusBaseRoll.toFixed(2)} tmbP=${topMinusBasePitch.toFixed(2)} vA=${vectorAngle.toFixed(2)} bend=${bendMagnitude.toFixed(2)} seq=${topSeq} top=${topConnected} sens=${sensingEnabled} zero=${zeroReady}`);

    return recvBuf.subarray(packet_bytes);
}

module.exports = {
    parseTelemetryData
};
