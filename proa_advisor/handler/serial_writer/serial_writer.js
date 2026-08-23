// For requesting the master node to send a command to a specific mac address. 
// Mac address for the specific role (e.g. IMU) is hardcoded for now but can be made dynamic by 
// letting the master node to send over the mac addr in the function onDataRecv(...)
// Need to take not that some transmission send in ingle packet while some send in array of packet. Find a way to append mac address before serial.writing to the server

const { getConnectedPort } = require("../serial_reader/serialReader");

let port = null;

function requestCommand(macAddress, command) {
    // Short command/code (e.g. START, STOP, RESET) to be sent to the master node for a specific role (e.g. IMU)
    if (!port) {
        port = getConnectedPort();
    }
    if (!port) {
        console.error('No connected serial port available for sending command.');
        return false;
    }

    // Message (Seperator |, do not use : as mac address contains :)
    const message = `${macAddress}|${command}\n`;
    const messageBuffer = Buffer.from(message, 'ascii');
    port.write(messageBuffer, (err) => {
        if (err) {
            console.error('Error writing to serial port:', err.message);
        } else {
            //console.log(`Command sent: ${message}`);
        }
    });
    return true;
}

module.exports = {
    requestCommand
};