const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { onNewSample } = require("./kalman_filter")

const PACKET_BYTES = 4 + 2 + 4 + (8 * 2) + 2; // Fix at 28 bytes
const HEADER = 'PWER';
const HEADER_BUFFER = Buffer.from(HEADER, 'ascii');
const HEADER_INT = HEADER_BUFFER.readUInt32LE(0);
const TIME_BETWEEN_SAMPLES_ALERT = 5000;

async function findValidPort(baudRate = 2000000, timeoutMs = 2000) {
    // Get the list of ports for the device
    // Ports only show up when something is connected, so need to re-fetch the list
    const portList = await SerialPort.list();

    if (portList.length === 0) {
        console.log('No connected serial ports found.');
        return null;
    }

    for (const portInfo of portList) {
        // Iterate through serial port
        // Write a trigger b'START\n' to each port and wait for a valid response of "ADC READY'
        // or if length of line == packet bytes, return that port
        try {
            const port = new SerialPort({ path: portInfo.path, baudRate, autoOpen: false });
            await port.open();
            const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

            for (let attempt = 0; attempt <= 2; attempt++) {
                port.write('START\n');
                await port.drain();

                const line = await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        parser.removeAllListeners('data');
                        resolve(null);
                    }, timeoutMs);

                    parser.once('data', (data) => {
                        clearTimeout(timeout);
                        parser.removeAllListeners('data');
                        resolve(data.trim());
                    });
                });
                if (line && line.includes('ADC Ready')) {
                    return { port, path: portInfo.path };
                } else if (line && line.includes(HEADER)) {
                    return { port, path: portInfo.path };
                }
                console.log(`Attempt ${attempt + 1}/3: No valid response from ${portInfo.path}`);
            }

            port.close();
        }
        catch (err) {
            console.error(`Error testing port ${portInfo.path}: ${err.message}`);
        }
    }

    console.log('No valid serial ports found after testing all candidates.');
    return null;
}


let recvBuf = Buffer.alloc(0);
let lastCounter = -1;
let offsetCounter = 0;

function additiveChecksum(readings, counter) {
    let sum = counter & 0xFFFF;
    for (let i = 0; i < readings.length; i++) {
        sum ^= (readings[i] << (i + 1));
    }
    return sum % 65536;
}

const queue = [];
function processBuffer() {
    // Scan for a valid packet starting at offset 0, discard bytes until we find one
    while (recvBuf.length >= PACKET_BYTES) {
        // Find header
        if (recvBuf.readUInt32LE(0) !== HEADER_INT) {
            recvBuf = recvBuf.subarray(1); // Advance one byte to re-sync
            continue;
        }

        // Not enough data yet for a full packet
        if (recvBuf.length < PACKET_BYTES) break;

        const counter  = recvBuf.readUInt16LE(4);
        const time_diff_us = recvBuf.readUInt32LE(6);
        const readings = [];
        for (let i = 0; i < 8; i++) {
            readings.push(recvBuf.readUInt16LE(10 + i * 2));
        }
        const chksum = recvBuf.readUInt16LE(26);

        if (chksum !== additiveChecksum(readings, counter)) {
            console.warn(`Checksum fail at counter ${counter}. Re-syncing.`);
            recvBuf = recvBuf.subarray(1);
            continue;
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

        recvBuf = recvBuf.subarray(PACKET_BYTES);
    }
    consumeQueue();
}
let consuming = false;
async function consumeQueue() {
    if (consuming) return;
    consuming = true;

    while (queue.length > 0) {
        const sample = queue.shift();
        await onNewSample(sample);
    }
    consuming = false;
}

async function startSerialReader() {
    const result = await findValidPort();

    if (!result) {
        console.log('Retrying in 3 seconds...');
        setTimeout(startSerialReader, 3000);
        return;
    }

    const { port, path } = result;
    console.log(`Listening on ${path}`);

    // Use raw data events — not a line parser since this is binary
    port.on('data', (chunk) => {
        recvBuf = Buffer.concat([recvBuf, chunk]);
        processBuffer();
    });

    port.on('close', () => {
        console.warn(`Port ${path} closed. Rescanning...`);
        recvBuf = Buffer.alloc(0); // Clear buffer on disconnect
        lastCounter = -1;
        offsetCounter = 0;
        setTimeout(startSerialReader, 5000);
    });

    port.on('error', (err) => {
        console.error(`Port error: ${err.message}. Rescanning...`);
        setTimeout(startSerialReader, 5000);
    });
}

module.exports = { startSerialReader };