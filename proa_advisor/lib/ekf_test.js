const fs = require('fs');
const csv = require('csv-parser');

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
                    //console.log(`Loaded sample from ${path}: counter=${counter}, time_diff_us=${timediff_us}, ch0=${ch0}, ch1=${ch1}, ch2=${ch2}, ch3=${ch3}, ch4=${ch4}, ch5=${ch5}, ch6=${ch6}, ch7=${ch7}`);   
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
    const files = get_all_files_in_folder('./model/battery_model/test_data');
    const consolidated = await consolidated_data(files);
    console.log(`Total samples to process: ${consolidated.length}`);
    for (const line of consolidated) {
        //console.log(`Processing sample: counter=${line.counter}, time_diff_us=${line.time_diff_us}, a0=${line.a0}, a1=${line.a1}, a2=${line.a2}, a3=${line.a3}, a4=${line.a4}, a5=${line.a5}, a6=${line.a6}, a7=${line.a7}`);
        await onNewSample(line);
        //await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
}

module.exports = {
    run_test
}