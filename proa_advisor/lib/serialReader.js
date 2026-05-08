const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function findJsonPort(baudRate = 115200, timeoutMs = 2000) {
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
                    cleanup();
                    resolve(null);
                }, timeoutMs);

                function cleanup() {
                    clearTimeout(timeout);
                    parser.removeAllListeners('data');
                    port.removeAllListeners('error');
                    // Close only if we are NOT keeping this port open
                    if (port.isOpen) port.close();
                }

                // Start listening for data
                parser.on('data', (line) => {
                    try {
                        const data = JSON.parse(line.trim());
                        console.log(`Found JSON on ${portInfo.path}:`, data);
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

async function startSerialReader() {
    const result = await findJsonPort();

    if (!result) {
        console.log('Retrying in 5 seconds...');
        setTimeout(startSerialReader, 5000);
        return;
    }

    const { port, parser, path } = result;
    console.log(`Listening on ${path}`);

    // Persistent reading — reuse the already-open port
    parser.on('data', async (line) => {
        try {
            const data = JSON.parse(line.trim());
            console.log('Data:', data);
            /*
                incoming data format:
                {
                    "stationMacAddr": "Mac address of the esp connected to the pi",
                    "transmittorMacAddr": "Mac address of the esp sending the data",
                    "role": "What the esp do (Can have multiple esp with same role",
                    other data fields sent by the esp (e.g. voltage, current, power, etc...)
                }
            */

            // TODO: save to MongoDB here

        } catch {
            // Ignore non-JSON lines (ESP boot messages)
        }
    });

    port.on('close', () => {
        console.warn(`Port ${path} closed. Rescanning...`);
        setTimeout(startSerialReader, 5000);
    });

    port.on('error', (err) => {
        console.error(`Port error: ${err.message}. Rescanning...`);
        setTimeout(startSerialReader, 5000);
    });
}

module.exports = { startSerialReader };