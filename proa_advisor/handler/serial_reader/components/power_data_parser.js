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

function parsePowerData(recvBuf, packet_bytes, lastCounter, offsetCounter, packetSkipped = 0) {
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
        return [null, lastCounter, offsetCounter];
    }

    // Counter realignment on 16-bit wraparound
    let adjustedCounter = counter;
    if (lastCounter !== -1) {
        if (counter < lastCounter && (lastCounter - counter) > 0x7FFF) {
            offsetCounter = (lastCounter + 1) - counter;
        }
    }
    adjustedCounter = counter + offsetCounter;

    if (lastCounter !== -1 && adjustedCounter !== lastCounter + 1) {
        console.warn(`Packet loss: counter jumped from ${lastCounter} to ${adjustedCounter}`);
    }

    lastCounter = adjustedCounter;

    if (time_diff_us > TIME_BETWEEN_SAMPLES_ALERT) {
        console.warn(`Large time gap: ${time_diff_us} us at counter ${adjustedCounter}`);
    }

    queue.push({
        counter: adjustedCounter,
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
    
    return [recvBuf.subarray(packet_bytes), lastCounter, offsetCounter];
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