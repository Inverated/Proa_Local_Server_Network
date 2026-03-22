const express = require("express");

const app = express();
const port = 4000;

const bodyParser = require("body-parser");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use(express.static('public'));
app.set("view engine", "ejs")


app.get("/", (req, res) => {
    res.render("main", {
        selectedTab: "overview"
    });
});

app.get("/power_management", (req, res) => {
    res.render("power_management", {
        selectedTab: "power_management"
    });
});





app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});
