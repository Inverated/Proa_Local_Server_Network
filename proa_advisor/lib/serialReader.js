const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { onNewSample } = require("./kalman_filter")

async function findJsonPort(baudRate = 921600, timeoutMs = 2000) {
    // Get the list of ports for the device
    // Ports only show up when something is connected, so need to re-fetch the list
    const portList = await SerialPort.list();

    if (portList.length === 0) {
        console.log('No connected serial ports found.');
        return null;
    }

    console.log(`Scanning ${portList.length} port(s)...`);

    for (const portInfo of portList) {
        console.log(`Trying ${portInfo.path}...`);

        const found = await new Promise((resolve) => {
            const port = new SerialPort({ path: portInfo.path, baudRate, autoOpen: false });

            // Rmb to open first before scanning for serial output
            port.open((err) => {
                if (err) {
                    console.warn(`  Could not open ${portInfo.path}: ${err.message}`);
                    return resolve(null);
                }

                const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

                const timeout = setTimeout(() => {
                    cleanup();      // Stop listening for data/errors since we timed out
                    resolve(null);
                }, timeoutMs);

                function cleanup() {
                    clearTimeout(timeout);
                    parser.removeAllListeners('data');
                    port.removeAllListeners('error');
                    // Close only if we are not keeping this port open to reuse when found
                    if (port.isOpen) port.close();
                }

                // Start listening for data
                parser.on('data', (line) => {
                    try {
                        const data = JSON.parse(line.trim());
                        console.log(`Found JSON on ${portInfo.path}:`, data);

                        if (!data.stationMacAddr) {
                            console.log("  JSON does not have 'stationMacAddr', ignoring...");
                            return; // 
                        }

                        clearTimeout(timeout);

                        // Stop listening for more data/errors since we found our port
                        // Keep port open (Dont run cleanup())
                        parser.removeAllListeners('data');
                        port.removeAllListeners('error');

                        // Resolve (Returns) with the open port so we can keep using it
                        resolve({ port, parser, path: portInfo.path });
                    } catch {
                        // Not JSON
                    }
                });

                // Listen for errors from the port (e.g. permission issues, disconnects)
                port.on('error', (err) => {
                    console.warn(`  Error on ${portInfo.path}: ${err.message}`);
                    cleanup();
                    resolve(null);
                });
            });
        });

        if (found) return found; // Stop scanning once found
    }

    console.error('No port with JSON output found.');
    return null;
}

const PACKET_BYTES = 4 + 2 + 4 + (8 * 2) + 2; // 28 bytes
const HEADER = Buffer.from('PWER');
const HEADER_INT = HEADER.readUInt32LE(0);
const TIME_BETWEEN_SAMPLES_ALERT = 1000;

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

function processBuffer(onNewSample) {
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
        const timediff = recvBuf.readUInt32LE(6);
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

        if (timediff > TIME_BETWEEN_SAMPLES_ALERT) {
            console.warn(`Large time gap: ${timediff} us at counter ${adjustedCounter}`);
        }

        onNewSample({
            counter:     adjustedCounter,
            time_diff_us: timediff,
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
}

async function startSerialReader() {
    const result = await findJsonPort();

    if (!result) {
        console.log('Retrying in 3 seconds...');
        setTimeout(startSerialReader, 3000);
        return;
    }

    const { port, path } = result;
    console.log(`Listening on ${path}`);

    // Use raw data events — not a line parser — since this is binary
    port.on('data', (chunk) => {
        recvBuf = Buffer.concat([recvBuf, chunk]);
        processBuffer(onNewSample);
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