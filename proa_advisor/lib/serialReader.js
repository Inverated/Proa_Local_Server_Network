const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

async function findJsonPort(baudRate = 115200, timeoutMs = 2000) {
    const portList = await SerialPort.list();

    if (portList.length === 0) {
        console.log('No serial ports found.');
        return null;
    }

    console.log(`Scanning ${portList.length} port(s)...`);

    for (const portInfo of portList) {
        console.log(`Trying ${portInfo.path}...`);

        const found = await new Promise((resolve) => {
            const port = new SerialPort({ path: portInfo.path, baudRate, autoOpen: false });

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

                parser.on('data', (line) => {
                    try {
                        console.log(line);
                        const data = JSON.parse(line.trim());
                        console.log(`Found JSON on ${portInfo.path}:`, data);
                        clearTimeout(timeout);
                        parser.removeAllListeners('data');
                        port.removeAllListeners('error');
                        // Resolve with the open port so we can keep using it
                        resolve({ port, parser, path: portInfo.path });
                    } catch {
                        // Not JSON
                    }
                });

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
            // TODO: save to MongoDB here
        } catch {
            // Ignore non-JSON lines (ESP boot messages, etc.)
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