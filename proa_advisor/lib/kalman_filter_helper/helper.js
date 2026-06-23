const fs = require('fs');

function load_battery_constants(battery_type = 'LiNMC') {
    const constants_path = "./model/battery_model/" + battery_type + "/battery_constants.json";
    const data = fs.readFileSync(constants_path, 'utf8');
    const json_data = JSON.parse(data);
    return json_data;
}

function soc_to_index(soc, factor = 3) {
    // Get index from a list of values from 0 to 100 with step of 0.001 (factor of 3)
    // SoC ammended to range 0-1 instead of 0-100
    const val = soc * 100 * 10**factor;
    return Math.round(val) + 1;
}

function diag(values) {
    return values.map((v, i) => {
        const row = Array(values.length).fill(0);
        row[i] = v;
        return row;
    });
}

module.exports = {
    load_battery_constants,
    soc_to_index,
    diag
};