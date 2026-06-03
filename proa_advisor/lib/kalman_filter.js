const { initialise_filter, set_alternate_battery, set_main_battery, update } = require("./kalman_filter_helper/filter")
const { adc_to_current, adc_to_voltage } = require("./adc_converter")
const { insertBatteryState, insertSocSensorData, insertSocSensorDataBulk, getLastBatteryState } = require("../model/db")

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
const SAMPLE_INTERVAL_BEFORE_WRITE = 500; // Every 500 samples write 1 row; ard 0.5s at 1kHz sampling rate
let data_array = [];
let is_initialised = false;
let sample_count = 0;
let current_run_id = null;

async function onNewSample(sample) {
    if (current_run_id === null) {
        current_run_id = await getRunId();
    }
    const { time_diff_us, a0, a1, a2, a3, a4, a5, a6, a7 } = sample;
    const mppt_out  = adc_to_current(a0, 1);
    const load_in   = adc_to_current(a1, 1);
    const batt1_net = adc_to_current(a2, 1);
    const batt2_net = adc_to_current(a3, 1);
    const batt1_v   = adc_to_voltage(a6, 5) * VOLTAGE_DIVIDER_RATIO;
    const batt2_v   = adc_to_voltage(a7, 5) * VOLTAGE_DIVIDER_RATIO;

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

    if (!is_initialised) {
        // Alternate battery not used yet
        set_main_battery("LiNMC");
        initialise_filter("main", batt1_v);
        is_initialised = true;
    }

    // Store updated state, cov mtx, process noise for recovery later if needed
    // process noise to ignore during recovery if time passed > tau 2
    const [updated_state, covariance_matrix, process_noise] = await update("main", time_diff_us, batt1_net, batt2_net, mppt_out, load_in, batt1_v, batt2_v);

    sample_count++;
    if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0) {
        await insertBatteryState(current_run_id, updated_state, covariance_matrix, process_noise);
        await insertSocSensorDataBulk(data_array);
        data_array = [];
    }
}