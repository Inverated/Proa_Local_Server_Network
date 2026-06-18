
const { write_to_clients } = require('./client_transmission')

function streamPowerData(timestamp, voltage_reading_main, corrected_voltage_main) {
    const powerData = {
        timestamp,
        voltage_reading_main,
        corrected_voltage_main
    };
    console.log(powerData)
    write_to_clients(powerData);
}

module.exports = {
    streamPowerData
};