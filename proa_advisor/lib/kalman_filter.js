const { initialise_filter, set_alternate_battery, set_main_battery, update } = require("./kalman_filter_helper/filter")
const { adc_to_current, adc_to_voltage } = require("./adc_converter")
const { insertMainBatteryState, insertAlternateBatteryState, insertSocSensorData, insertSocSensorDataBulk, getLastMainBatteryState, getLastAlternateBatteryState, getRunId } = require("../model/db")

/*
ADS8688 Pinouts:
Pin     Setup 1     Setup 2
A0      MPPT_Out    Batt1_In
A1      Load_In     Batt1_Out
A2      Batt1_Net   Batt2_In
A3      Batt2_Net   Batt2_Out
A4      NA          NA          (Unused)
A5      NA          NA          (Unused)
A6      Batt1_V     Batt1_V     (Voltage divider of R1: 100k; R2: 20k)
A7      Batt2_V     Batt2_V     (Voltage divider of R1: 100k; R2: 20k)

All inputs are wired to be positive (Current flow into MPPT / Load), 
except battery which can have both direction, 
face it such that reading positive for current into battery

Batt 1: Main battery, LiNMC, 2s1p pack, 48.0V nominal, 104Ah
Batt 2: Alternate battery, LiFePO4, 2s1p pack, 48.0V nominal, 50Ah
*/

const VOLTAGE_DIVIDER_RATIO = (100 + 20) / 20; // R1 + R2 / R2
const SAMPLE_INTERVAL_BEFORE_WRITE = 1000;
const SAVE_STATES_TO_DB = false;
const SAVE_ADC_READINGS_TO_DB = false;
const SAMPLE_INTERVAL_MS = 0; // Adjust this value as needed to simulate real-time data arrival

let data_array = [];
let is_main_initialised = false;
let is_alternate_initialised = false;
let sample_count = 0;
let current_run_id = null;

let activeUpdates = 0;

let m_updated_state = null, m_covariance_matrix = null, m_process_noise = null;
let a_updated_state = null, a_covariance_matrix = null, a_process_noise = null;

let total_current = 0;
let total_time = 0;

async function onNewSample(sample, log = false) {
    activeUpdates++;

    if (activeUpdates % 100 === 0) {
        console.log("Background updates:", activeUpdates);
    }
    try {

        if (current_run_id === null) {
            current_run_id = await getRunId();
        }
        let { counter, time_diff_us, a0, a1, a2, a3, a4, a5, a6, a7 } = sample;

        let mppt_out  = Math.max(adc_to_current(a0, 1), 0);
        let load_in   = Math.max(adc_to_current(a1, 1), 0);
        let batt1_net = adc_to_current(a2, 1);
        let batt2_net = adc_to_current(a3, 1);
        let batt1_v   = adc_to_voltage(a6, 5) * VOLTAGE_DIVIDER_RATIO;
        let batt2_v   = adc_to_voltage(a7, 5) * VOLTAGE_DIVIDER_RATIO;

        // Temp changes //
        batt1_v *= 2;
        batt2_v = batt1_v;
        batt2_net = 0;
        batt1_net = batt1_net;
        /// -----------///

        total_current += load_in;
        total_time += time_diff_us / 1e6;

        data_array.push({
            run_id: current_run_id,
            time_diff: time_diff_us,
            adcReading0: a0,
            adcReading1: a1,
            adcReading2: a2,
            adcReading3: a3,
            adcReading4: a4,
            adcReading5: a5,
            adcReading6: a6,
            adcReading7: a7
        });
    
        if (!is_main_initialised && batt1_v > 12) {
            try {
                set_main_battery("LiNMC");
                await initialise_filter("main", batt1_v);
            } catch (err) {
                throw err; // Rethrow to be caught by outer try-catch
            }
            is_main_initialised = true;
        }

        if (!is_alternate_initialised && batt2_v > 12) {
            try {
                set_alternate_battery("LiNMC");
                await initialise_filter("alternate", batt2_v);
            } catch (err) {
                throw err; // Rethrow to be caught by outer try-catch
            }
            is_alternate_initialised = true;
        }
    
        // Store updated state, cov mtx, process noise for recovery later if needed
        // process noise to ignore during recovery if time passed > tau 2
        if (batt1_v > 12) {
            [m_updated_state, m_covariance_matrix, m_process_noise] = await update({
                battery_role: "main",
                time_diff_us: time_diff_us,
                I_batt_main: batt1_net,
                I_batt_alternate: batt2_net,
                I_mppt: mppt_out,
                I_load: load_in,
                V_terminal: batt1_v
            });
            //console.log(`Input into update function: time_diff_us=${time_diff_us}, I_batt_main=${batt1_net}, I_batt_alternate=${batt2_net}, I_mppt=${mppt_out}, I_load=${load_in}, V_terminal=${batt1_v}`);
        }

        if (batt2_v > 12) {
            [a_updated_state, a_covariance_matrix, a_process_noise] = await update({
                battery_role: "alternate",
                time_diff_us: time_diff_us,
                I_batt_main: batt1_net,
                I_batt_alternate: batt2_net,
                I_mppt: mppt_out,
                I_load: load_in,
                V_terminal: batt2_v
            });
        }
    
        sample_count++;
        if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0 || log) {
            if (SAVE_ADC_READINGS_TO_DB) {
                await insertSocSensorDataBulk(data_array);
            }
            if (batt1_v > 12 && SAVE_STATES_TO_DB) {
                const main_sensor_readings = {
                    I_batt_main: batt1_net,
                    I_batt_alternate: batt2_net,
                    I_mppt: mppt_out,
                    I_load: load_in,
                    V_batt_main: batt1_v,
                    V_batt_alternate: batt2_v
                }
                await insertMainBatteryState(current_run_id, m_updated_state, m_covariance_matrix, m_process_noise, main_sensor_readings);
            }
            if (batt1_v > 12) {
                console.log(`Counter: ${sample_count}, SoC Main: ${m_updated_state[0].toFixed(5)}%, Voltage Main: ${batt1_v.toFixed(5)}V, Current Main: ${batt1_net.toFixed(5)}A`);
            }
            if (batt2_v > 12 && SAVE_STATES_TO_DB) {
                const alternate_sensor_readings = {
                    I_batt_main: batt1_net,
                    I_batt_alternate: batt2_net,
                    I_mppt: mppt_out,
                    I_load: load_in,
                    V_batt_main: batt1_v,
                    V_batt_alternate: batt2_v
                };
                await insertAlternateBatteryState(current_run_id, a_updated_state, a_covariance_matrix, a_process_noise, alternate_sensor_readings);
            }

            if (batt2_v > 12) {
                //console.log(`Counter: ${sample_count}, SoC Alternate: ${a_updated_state[0].toFixed(5)}%, Voltage Alternate: ${batt2_v.toFixed(5)}V, Current Alternate: ${batt2_net.toFixed(5)}A`);
            }
            //console.log(`Total Current: ${total_current.toFixed(5)}A, Total Time: ${total_time.toFixed(5)}s`);
            data_array = [];
            if (SAMPLE_INTERVAL_MS > 0) {
                await new Promise(resolve => setTimeout(resolve, SAMPLE_INTERVAL_MS)); // Simulate delay for real-time processing
            }
        }
    } finally {
        activeUpdates--;
    }

}

async function getCurrentRunId() {
    if (current_run_id === null) {
        current_run_id = await getRunId();
    }
    return current_run_id;
}

module.exports = {
    onNewSample,
    getCurrentRunId
}