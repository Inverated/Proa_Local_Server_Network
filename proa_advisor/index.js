const express = require("express");
const path = require("path");
const app = express();
const port = 4000;
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const { startDB, insertBatteryState } = require('./model/power_management_models');
const { populateInitalChartData } = require('./model/db');
const { run_test } = require("./lib/ekf_test")
const { getCurrentRunId, setAlternateBatteryType, setMainBatteryType } = require("./lib/kalman_filter");
const { startSerialReader } = require('./handler/serial_reader/serialReader');
const { add_client, get_clients, remove_client } = require("./handler/client_transmission");
const { updateDatabase } = require("./handler/database_update/database_update");
const OVERRIDE_DB = true; // Set to true to override existing data in RC mapping tables
const main_battery_type = "LiNMC";
const alternate_battery_type = "LiFePO4";

function startServer() {
    startDB().then(() => {
        //return insertBatteryState(battery_type = "LiNMC", tableName = "MainRCMapping", override = OVERRIDE_DB);
        setMainBatteryType(main_battery_type);
        return insertBatteryState(battery_type = main_battery_type, tableName = "MainRCMapping", override = OVERRIDE_DB);
    }).then((count) => {
        count && console.log(`Inserted ${count} records into MainRCMapping.`);
    }).then(() => {
        //return insertBatteryState("LiFePO4", "AlternateRCMapping", OVERRIDE_DB);
        setAlternateBatteryType(alternate_battery_type);
        return insertBatteryState(alternate_battery_type, "AlternateRCMapping", OVERRIDE_DB);
    }).then((count) => {
        count && console.log(`Inserted ${count} records into AlternateRCMapping.`);
    }).then(() => {
        console.log("\n//====================================================//\nDatabase setup complete.\n//====================================================//\n");
        if (process.env.IS_TEST_RUN === 'true') {
            run_test();
        } else {
            startSerialReader();
        }
    });
}

function test() {
    console.log("Starting test...");
}

setInterval(updateDatabase, 1000); // Call updateDatabase every 10 seconds

startServer();

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

app.get("/initial_data", async (req, res) => {
    try {
        const runId = await getCurrentRunId();
        const initialData = await populateInitalChartData(runId);
        res.json(initialData.reverse());
    } catch (error) {
        console.error("Error fetching initial data:", error);
        res.status(500).send("Error fetching initial data");
    }
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

app.listen(port, "0.0.0.0", () => {
    console.log(`Listening on port ${port}`);
    console.log(`Access the application at http://localhost:${port}`);
});