const express = require("express");

const app = express();
const port = 4000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Start async serial reader
const { startSerialReader } = require('./lib/serialReader');
//startSerialReader();

const { db, insertBatteryState } = require('./model/power_management_models');
insertBatteryState("LiNMC", "MainRCMapping");

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});
