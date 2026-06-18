const express = require("express");

const app = express();
const port = 4000;
const cors = require("cors");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


const { startDB, insertBatteryState } = require('./model/power_management_models');
const { run_test } = require("./lib/ekf_test")
const { startSerialReader } = require('./lib/serialReader');

const OVERRIDE_DB = false; // Set to true to override existing data in RC mapping tables

startDB().then(() => {
    console.log("Database started successfully.");
    return insertBatteryState(battery_type = "LiNMC", tableName = "MainRCMapping", override = OVERRIDE_DB);
}).then((count) => {
    console.log(`Inserted ${count} records into MainRCMapping.`);
}).then(() => {
    return insertBatteryState(battery_type = "LiNMC", tableName = "AlternateRCMapping", override = OVERRIDE_DB);
}).then((count) => {
    console.log(`Inserted ${count} records into AlternateRCMapping.`);
}).then(() => {
    run_test();
    //startSerialReader();
});

const { add_client, get_clients, remove_client } = require("./handler/client_transmission");
 

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

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});
