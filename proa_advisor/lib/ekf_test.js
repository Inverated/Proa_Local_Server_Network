const fs = require('fs');
const csv = require('csv-parser');

const TEST_FILE_LOCATION = './model/battery_model/test_data';

const { onNewSample } = require("../lib/kalman_filter")

function get_all_files_in_folder(folder_path) {
    return fs.readdirSync(folder_path).filter(file => file.endsWith('.csv'));
}

async function consolidated_data(path_array) {
    const promises = path_array.map(path => {
        return new Promise((resolve, reject) => {
            const file_data = [];
            fs.createReadStream(`./model/battery_model/test_data/${path}`)
                .pipe(csv())
                .on('data', (row) => {
                    const { counter, timediff_us, ch0, ch1, ch2, ch3, ch4, ch5, ch6, ch7 } = row;
                    if (counter != undefined) {
                        file_data.push({
                            counter,
                            time_diff_us: timediff_us,
                            a0: ch0,
                            a1: ch1,
                            a2: ch2,
                            a3: ch3,
                            a4: ch4,
                            a5: ch5,
                            a6: ch6,
                            a7: ch7
                        })
                    } else {
                        const { id, timestamp, run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7 } = row;
                        file_data.push({
                            counter: id,
                            time_diff_us: time_diff,
                            a0: adcReading0,
                            a1: adcReading1,
                            a2: adcReading2,
                            a3: adcReading3,
                            a4: adcReading4,
                            a5: adcReading5,
                            a6: adcReading6,
                            a7: adcReading7
                        })
                    }
                })
                .on('end', () => {
                    console.log(`Finished loading data from ${path}`);
                    resolve(file_data);
                })
                .on('error', (error) => {
                    reject(error);
                });
        })
    });
    const results = await Promise.all(promises);
    const consolidated = results.flat();
    console.log(`Total samples loaded: ${consolidated.length}`);
    return consolidated;
}

const DELAY_MS = 1000; // Adjust this value as needed to simulate real-time data arrival
async function run_test() {
    const files = get_all_files_in_folder(TEST_FILE_LOCATION);
    console.log(`Found ${files.length} test files`);
    const consolidated = await consolidated_data(files);
    console.log(`Total samples to process: ${consolidated.length}`);

    for (let i = 0; i < consolidated.length; i++) {
        if (i == consolidated.length - 1) {
            await onNewSample(consolidated[i], force_log = true, is_test = true);
        } else {
            await onNewSample(consolidated[i], force_log = false, is_test = true);
        }
    }
}

module.exports = {
    run_test
}