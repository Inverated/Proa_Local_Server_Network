const express = require("express");

const app = express();
const port = 4000;

const bodyParser = require("body-parser");
const { connectDB } = require("./model/db");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const { startSerialReader } = require('./lib/serialReader');
startSerialReader();

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});
