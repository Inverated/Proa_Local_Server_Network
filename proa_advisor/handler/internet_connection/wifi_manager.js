const { spawn } = require("child_process");
const os = require("os");

const dev = "wlan1";

function connectToWifi(ssid, password) {
    if (os.platform() !== "linux") {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        const nmcli = spawn("nmcli", [
            "device",
            "wifi",
            "connect",
            ssid,
            "password",
            password,
            "ifname",
            dev,
        ]);

        nmcli.stdout.on("data", (data) => {
            console.log("nmcli:", data.toString());
        });

        nmcli.stderr.on("data", (data) => {
            console.error("nmcli error:", data.toString());
        });

        nmcli.on("close", (code) => {
            console.log("nmcli exited with code:", code);

            if (code === 0) {
                console.log("Wi-Fi connected successfully");
                resolve(true);
            } else {
                console.log("Failed to connect");
                resolve(false);
            }
        });

        nmcli.on("error", (err) => {
            console.error("Failed to start nmcli:", err);
            resolve(false);
        });
    });
}

module.exports = { connectToWifi };