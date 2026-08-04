    const { spawn } = require("child_process");
    const os = require("os");

    const dev = "wlan1";

    function connectToWifi(ssid, password) {
        if (os.platform() !== "linux") {
            return Promise.resolve({ success: false, message: "Wi-Fi connection is only supported on Linux" });
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

            let output = "";
            
            nmcli.stdout.on("data", (data) => {
                console.log("nmcli:", data.toString());
                output += data.toString();
            });

            nmcli.stderr.on("data", (data) => {
                console.error("nmcli error:", data.toString());
                output += data.toString();
            });

            nmcli.on("close", (code) => {
                console.log("nmcli exited with code:", code);

                if (code === 0) {
                    console.log("Wi-Fi connected successfully");
                    resolve({ success: true, message: "Wi-Fi connected successfully", output });
                } else {
                    console.log("Failed to connect");
                    resolve({ success: false, message: "Failed to connect to Wi-Fi", output });
                }
            });

            nmcli.on("error", (err) => {
                console.error("Failed to start nmcli:", err);
                output += err.toString();
                resolve({ success: false, message: "Failed to start nmcli", output });
            });
        });
    }

    module.exports = { connectToWifi };