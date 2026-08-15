// Starts the server from here instead of directly from index.js
// Allows for event handling and restarting the server if needed
// Account for windows and linus 

const express = require("express");
const { fork, spawn } = require("child_process");
const path = require("path");

let child = null;
let isRestarting = false;
const rootDir = path.resolve(__dirname, "..")

function runRebuild() {
    return new Promise((resolve, reject) => {
        const cmd = process.platform === "win32" ? "yarn.cmd" : "yarn";

        const rebuild = spawn(cmd, ["rebuild"], {
            stdio: "inherit",
            shell: true,
            cwd: rootDir
        });

        rebuild.on("close", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`yarn rebuild failed with exit code ${code}`));
            }
        });

        rebuild.on("error", reject);
    });
}

async function startServer() {
    child = fork("./index.js");

    child.on("message", (message) => {
        if (message.action === "restart") { // unused, but kept for future use
            isRestarting = true;
            child.kill("SIGTERM");
        } else if (message.action === "rebuild") {
            runRebuild()
            .then(() => {
                    isRestarting = true;
                    console.log("Rebuild completed successfully. Restarting server...");
                    child.kill("SIGTERM");
                })
                .catch((err) => {
                    console.error("Rebuild failed:", err);
                    isRestarting = false; // Prevent restart if rebuild fails
                });
        } else if (message.action === "stop") {
            isRestarting = false;
            child.kill("SIGTERM");
            // sudo shutdown now
            const shutdown = spawn("sudo", ["shutdown", "now"], {
                stdio: "inherit",
                shell: true,
                cwd: rootDir
            });
            shutdown.on("close", (code) => {
                if (code !== 0) {
                    console.error(`Shutdown command failed with exit code ${code}`);
                }            
            });
            
        }
    });

    child.on("close", (code, signal) => {   
        if (isRestarting) {
            console.log(`Server process exited with code ${code} and signal ${signal}. Restarting...`);
            startServer();
        } else {
            console.log(`Server process exited with code ${code} and signal ${signal}. Not restarting.`);
        }
    });

    child.on("error", (err) => {
        console.error("Failed to start server process:", err);
    });
}

startServer();