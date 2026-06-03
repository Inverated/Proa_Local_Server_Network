const fs = require('fs');

function load_battery_constants(battery_type = 'LiNMC') {
    const constants_path = "./model/battery_model/" + battery_type + "/battery_constants.json";
    const data = fs.readFileSync(constants_path, 'utf8');
    return JSON.parse(data);
}

function soc_to_index(soc, factor = 3) {
    // Get index from a list of values from 0 to 100 with step of 0.001
    const val = soc * 10**factor;
    return Math.round(val) + 1;
}

module.exports = {
    load_battery_constants,
    soc_to_index
};