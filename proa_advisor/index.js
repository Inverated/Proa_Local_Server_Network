// Modify how the node server starts but using a child process instead of directly starting
// Can include an on close with a signal to indicate if restart is required


const express = require("express");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");

const path = require("path");
const app = express();
const port = 4000;
const cors = require("cors");

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const process = require("node:process");
const { add_client, get_clients, remove_client } = require("./handler/client_transmission");
const { getCurrentRunId } = require("./lib/Kalman Filter/kalman_filter");
const { populateInitalChartData } = require('./model/db');
const { startBackend } = require("./server");
const { connectToWifi } = require("./handler/internet_connection/wifi_manager")
const {  } = require("./handler/terminal_socket/ws");
const { hasInternet } = require("./handler/database_update/connectivity");
const { switchMode } = require("./handler/switch_env_mode");
const { closeAllConnections } = require("./handler/terminal_socket/ws");
const { updateRepo } = require("./handler/repository/simple_git");
startBackend(); 


// Simple admin authentication for accessing dev panel as it is not a full-fledged web application. 
const users = [
    { username: process.env.DEFAULT_ADMIN_USERNAME, password: process.env.DEFAULT_ADMIN_PASSWORD }
]

app.post("/admin_login", (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username.toString().trim() && u.password === password.toString().trim());

    if (user) {
        const token = jwt.sign({ username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ token });
    } else {
        res.status(401).json({ message: "Invalid credentials" });
    }
});

const middlewareAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ message: "No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid token" });
    }
};


// ------------------- //
// PUBLIC ROUTES
// ------------------- //

// Data stream format => event: <event_type>\ndata: <data_as_json_string>\n\n
// Keep only one connection open to a client at a time
app.get("/data_stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    add_client(res);
    res.write(": connected\n\n");

    req.on("close", () => {
        remove_client(res);
    });
})

app.get("/initial_power_data", async (req, res) => {
    try {
        const runId = await getCurrentRunId();
        const initialData = await populateInitalChartData(runId);
        res.json(initialData.reverse());
    } catch (error) {
        console.error("Error fetching initial data:", error);
        res.status(500).send("Error fetching initial data");
    }
});

app.get("/has_internet", (req, res) => {
    hasInternet().then((internet) => {
        res.json({ hasInternet: internet });
    }).catch((error) => {
        res.status(500).json({ hasInternet: false, error: "Error checking internet connectivity" });
    });
});

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});


/* Captive portal setup */
// Android
app.get("/generate_204", (req, res) => {
    res.redirect("/");
});

// Android newer versions
app.get("/gen_204", (req, res) => {
    res.redirect("/");
});

// Apple iOS/macOS
app.get("/hotspot-detect.html", (req, res) => {
    res.redirect("/");
});

// Windows
app.get("/ncsi.txt", (req, res) => {
    res.redirect("/");
});

// ------------------- //
// PROTECTED ROUTES
// ------------------- //
app.post("/connect_wifi", middlewareAuth, (req, res) => {
    const { ssid, password } = req.body;
    if (!ssid || !password) {
        return res.status(400).json({ message: "SSID and password are required" });
    }
    const success = connectToWifi(ssid, password);
    if (success) {
        res.status(200).json({ message: "Connected to Wi-Fi successfully" });
    } else {
        res.status(500).json({ message: "Failed to connect to Wi-Fi" });
    }
});

app.get("/get_curr_mode", middlewareAuth, (req, res) => {
    const mode = process.env.IS_TEST_RUN === "true" ? "test" : "normal";
    res.status(200).json({ "mode": mode });
});

app.get("/set_mode_and_restart", middlewareAuth, (req, res) => {
    const { mode } = req.query;
    console.log(`Received request to switch mode to: ${mode}`);
    switchMode(mode);
    if (process.send) {
        closeAllConnections();
        process.send({
            action: "restart"
        });
    }
    res.status(200).json({ message: `Switched mode to ${process.env.IS_TEST_RUN === "true" ? "test" : "normal"}` });
});

app.get("/restart_server", middlewareAuth, (req, res) => {
    if (process.send) {
        closeAllConnections();
        process.send({
            action: "restart"
        });
    }
    res.status(200).json({ message: "Server is restarting..." });
});

app.get("/stop_server", middlewareAuth, (req, res) => {
    if (process.send) {
        closeAllConnections();
        process.send({
            action: "stop"
        });
    }
    res.status(200).json({ message: "Server is stopping..." });
});

app.get("/update_repo", middlewareAuth, (req, res) => {
    updateRepo().then(() => {
        console.log("Repository updated successfully.");
        res.status(200).json({ message: "Repository updated successfully." });
    }).catch((error) => {
        console.error("Error updating repository:", error);
        res.status(500).json({ message: "Error updating repository", error: error.message });
    });
});

app.listen(port, "0.0.0.0", () => {
    console.log(`Listening on port ${port}`);
    console.log(`Access the application at http://localhost:${port}`);
});

