const { onNewSample } = require("../../../lib/kalman_filter");

const TIME_BETWEEN_SAMPLES_ALERT = 5000;
const QUEUE_ALERT = 100;
const queue = [];

function additiveChecksum(readings, counter) {
    let sum = counter & 0xFFFF;
    for (let i = 0; i < readings.length; i++) {
        sum ^= (readings[i] << (i + 1));
    }
    return sum % 65536;
}

function parsePowerData(recvBuf, packet_bytes, packetSkipped = 0) {
    const counter = recvBuf.readUInt16LE(4);
    const time_diff_us = recvBuf.readUInt32LE(6);
    const readings = [];
    for (let i = 0; i < 8; i++) {
        readings.push(recvBuf.readUInt16LE(10 + i * 2));
    }
    const chksum = recvBuf.readUInt16LE(26);

    if (chksum !== additiveChecksum(readings, counter)) {
        console.warn(`Checksum fail at counter ${counter}. Re-syncing.`);
        recvBuf = recvBuf.subarray(1);
        return null;
    }

    if (time_diff_us > TIME_BETWEEN_SAMPLES_ALERT) {
        console.warn(`Large time gap: ${time_diff_us} us at counter ${counter}`);
    }

    queue.push({
        counter: counter,
        time_diff_us: time_diff_us,
        a0: readings[0],
        a1: readings[1],
        a2: readings[2],
        a3: readings[3],
        a4: readings[4],
        a5: readings[5],
        a6: readings[6],
        a7: readings[7],
    });
    
    return recvBuf.subarray(packet_bytes);
}


let consuming = false;
async function consumePowerQueue() {
    if (consuming) return;
    consuming = true;

    while (queue.length > 0) {
        const sample = queue.shift();
        await onNewSample(sample);
    }
    consuming = false;

    if (queue.length > QUEUE_ALERT) {
        console.warn(`Queue size: ${queue.length}`);
    }
}

module.exports = {
    parsePowerData,
    consumePowerQueue
};