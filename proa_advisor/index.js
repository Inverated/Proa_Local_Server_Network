const express = require("express");

const app = express();
const port = 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Start async serial reader
const { startSerialReader } = require('./lib/serialReader');
//startSerialReader();

const { db, insertBatteryState } = require('./model/power_management_models');
insertBatteryState(battery_type = "LiNMC", tableName = "MainRCMapping");

const { set_main_battery, initialise_filter } = require('./lib/EKF/filter');
set_main_battery("LiNMC");

async function init() {
    await initialise_filter("main", 50.0);
}
init();

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});
