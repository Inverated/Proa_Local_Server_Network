// Starts the server from here instead of directly from index.js
// Allows for event handling and restarting the server if needed
// Account for windows and linus 

const express = require("express");
const { fork } = require("child_process");

let child = null;
let isRestarting = false;

function startServer() {
    child = fork("./index.js");

    child.on("message", (message) => {
        if (message.action === "restart") {
            isRestarting = true;
            child.kill("SIGTERM");
        } else if (message.action === "stop") {
            isRestarting = false;
            child.kill("SIGTERM");
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