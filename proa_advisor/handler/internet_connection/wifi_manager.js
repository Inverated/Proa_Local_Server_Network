const { exec } = require('child_process');
const os = require('os');
const dev = "wlan1";

function connectToWifi(ssid, password) {
    
    let command = `nmcli dev wifi connect "${ssid}" password "${password}" ifname ${dev}`;
    if (os.platform() !== 'linux') {
        return false; // Only support Linux for now
    }
    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error connecting to Wi-Fi: ${error.message}`);
            return false;
        }
        if (stderr) {
            console.error(`Error: ${stderr}`);
            return false;
        }
       return true;
    });
}

module.exports = { connectToWifi };