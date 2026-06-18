const { Battery2RCEKF } = require("./kalman_filter_helper/filter")
const { CurrentKCLCorrector } = require("./kalman_filter_helper/kcl_corrector")
const { adc_to_current, adc_to_voltage } = require("./adc_converter")
const { load_battery_constants } = require('./kalman_filter_helper/helper');
const { insertMainBatteryState, insertAlternateBatteryState, insertKCLCorrectionState, insertSocSensorData, insertSocSensorDataBulk, getLastMainBatteryState, getLastAlternateBatteryState, getRunId } = require("../model/db")
const { getBatteryRC_OCV } = require("../model/db");
const { streamPowerData } = require("../handler/power_management")

/*
ADS8688 Pinouts:
Pin     Setup 1     Setup 2 (not in use)   Description
A0      MPPT_Out    Batt1_In                (Always positive but use bipolar ADC reading to detect miswiring and flip it)
A1      Load_In     Batt1_Out               (Always positive but use bipolar ADC reading to detect miswiring and flip it)
A2      Batt1_Net   Batt2_In
A3      Batt2_Net   Batt2_Out
A4      NA          NA                      (Unused)
A5      NA          NA                      (Unused)
A6      Batt1_V     Batt1_V                 (Voltage divider of R1: 100k; R2: 20k)
A7      Batt2_V     Batt2_V                 (Voltage divider of R1: 100k; R2: 20k)

All inputs are wired to be positive (Current flow into MPPT / Load), 
except battery which can have both direction, 
face it such that reading positive for current into battery

Batt 1: Main battery, LiNMC, 2s1p pack, 48.0V nominal, 104Ah
Batt 2: Alternate battery, LiFePO4, 2s1p pack, 48.0V nominal, 50Ah
*/

const SAMPLE_INTERVAL_BEFORE_WRITE  = 10000;
const SAVE_STATES_TO_DB             = false;
const SAVE_ADC_READINGS_TO_DB       = false;
const SAMPLE_INTERVAL_MS            = 10; // Adjust this value as needed to simulate real-time data arrival
let sample_count                    = 0;
let current_run_id                  = null;

const MIDPOINT                  = 2 ** 15 - 1; // Midpoint of 16-bit ADC
const VOLTAGE_DIVIDER_RATIO     = (100 + 20) / 20; // R1 + R2 / R2
const BATT_CUTOFF_VOLTAGE       = 30; // Voltage below which battery is considered disconnected or fully drained

const avg_kcl_noise             = [];
const KCL_CURRENT_THRESHOLD     = 0.05;
let data_array                  = [];
let main_battery                = null;
let alternate_battery           = null;
let kcl_corrector               = null;

const CURRENT_FLIP_THRESHOLD    = 5.0; // Threshold in Amps to detect if load or MPPT current is flipped due to wiring issues
let is_load_flipped             = false;
let is_mppt_flipped             = false;


let activeUpdates       = 0;  // Detect async update falling behind
let total_current       = 0;
let total_time          = 0;

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

        let mppt_out = is_mppt_flipped ? -adc_to_current(a0, 1) : adc_to_current(a0, 1);
        let load_in = is_load_flipped ? -adc_to_current(a1, 1) : adc_to_current(a1, 1);
        let batt1_net = adc_to_current(a2, 1);
        let batt2_net = adc_to_current(a3, 1);
        let batt1_v = adc_to_voltage(a6, 5) * VOLTAGE_DIVIDER_RATIO;
        let batt2_v = adc_to_voltage(a7, 5) * VOLTAGE_DIVIDER_RATIO;

        [mppt_out, load_in, batt1_net, batt2_net, batt1_v, batt2_v] = detectAndCorrectFlips(mppt_out, load_in, batt1_net, batt2_net, batt1_v, batt2_v);

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

        // Initialising EKF instance for the batteries and KCL corrector
        if (!main_battery && batt1_v > BATT_CUTOFF_VOLTAGE) {
            try {
                const { Q_total, sigma_v, sigma_i, sigma_kcl, interval_factor } = load_battery_constants("LiNMC");
                const rc_values = await getBatteryRC_OCV(batt1_v, interval_factor, "MainRCMapping");
                if (rc_values.length < 1) {
                    throw new Error(`No RC values found for voltage ${batt1_v.toFixed(4)}V in MainRCMapping`);
                }
                const { SoC, R0, R1, C1, C2, Tau1, Tau2, OCV } = rc_values[0];

                avg_kcl_noise.push(sigma_kcl);
                main_battery = new Battery2RCEKF({
                    name: "main",
                    capacityAh: Q_total,
                    noise: {
                        voltage: sigma_v ** 2,
                    },
                    initial: {
                        soc: SoC,
                        v1: 0,
                        v2: 0,
                    },
                });
                await main_battery.init();

                console.log(`Initialized main battery with SoC: ${100 * SoC.toFixed(4)}%, R0: ${R0.toFixed(4)}Ω, R1: ${R1.toFixed(4)}Ω, C1: ${C1.toFixed(2)}F, C2: ${C2.toFixed(2)}F`);
            } catch (err) {
                throw err; // Rethrow to be caught by outer try-catch
            }
        }

        if (!alternate_battery && batt2_v > BATT_CUTOFF_VOLTAGE) {
            try {
                const { Q_total, sigma_v, sigma_i, sigma_kcl, interval_factor } = load_battery_constants("LiFePO4");
                const rc_values = await getBatteryRC_OCV(batt2_v, interval_factor, "AlternateRCMapping");
                if (rc_values.length < 1) {
                    throw new Error(`No RC values found for voltage ${batt2_v.toFixed(4)}V in AlternateRCMapping`);
                }

                const { SoC, R0, R1, C1, C2, Tau1, Tau2, OCV } = rc_values[0];
                avg_kcl_noise.push(sigma_kcl);

                alternate_battery = new Battery2RCEKF({
                    name: "alternate",
                    capacityAh: Q_total,
                    noise: {
                        voltage: sigma_v ** 2,
                    },
                    initial: {
                        soc: SoC,
                        v1: 0,
                        v2: 0,
                    },
                })
                await alternate_battery.init();
                console.log(`Initialized alternate battery with SoC: ${100 * SoC.toFixed(4)}%, R0: ${R0.toFixed(4)}Ω, R1: ${R1.toFixed(4)}Ω, C1: ${C1.toFixed(2)}F, C2: ${C2.toFixed(2)}F`);
            } catch (err) {
                throw err; // Rethrow to be caught by outer try-catch
            }
        }

        if (!kcl_corrector) {
            kcl_corrector = new CurrentKCLCorrector({
                noise: {
                    kcl: avg_kcl_noise.length > 0 ? avg_kcl_noise.reduce((a, b) => a + b, 0) / avg_kcl_noise.length : 1e-4,
                },
            }).init();
            console.log(`Initialized KCL Corrector with noise: ${kcl_corrector.noise.kcl.toExponential(2)}A^2`);
        }

        // Tuning KCL process noise based on active channels
        const isActive = {};
        isActive.load   = load_in > KCL_CURRENT_THRESHOLD;
        isActive.charge = mppt_out > KCL_CURRENT_THRESHOLD;
        isActive.bat1   = Math.abs(batt1_net) > KCL_CURRENT_THRESHOLD;
        isActive.bat2   = Math.abs(batt2_net) > KCL_CURRENT_THRESHOLD;
        kcl_corrector.clampNoise(isActive);

        // Store updated state, cov mtx, process noise for recovery later if needed
        // process noise to ignore during recovery if time passed > tau 2
        const { state, biases, currents, diagnostics } = kcl_corrector.update({
            dt: time_diff_us / 1e6,
            loadCurrent: load_in,
            chargeCurrent: mppt_out,
            battery1NetCurrent: batt1_net,
            battery2NetCurrent: batt2_net,
        });

        if (!state || !biases || !currents) {
            throw new Error('KCL Corrector update failed to return valid state, biases, or currents.');
        }

        if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0) {
            if (SAVE_STATES_TO_DB) {
                await insertKCLCorrectionState(current_run_id, state.covariance, biases);    
            }
            console.log("\nInput values - \tMain: " + batt1_v.toFixed(5) + "V, Alt: " + batt2_v.toFixed(5) + "V, \t\tLoad: " + load_in.toFixed(5) + "A, \tCharge: " + mppt_out.toFixed(5) + "A, \tBatt1: " + batt1_net.toFixed(5) + "A, \tBatt2: " + batt2_net.toFixed(5) + "A");
            console.log(`Counter: ${sample_count}, KCL Corrected Currents: \t\t\tLoad: ${currents.loadCorrected.toFixed(5)}A, \tCharge: ${currents.chargeCorrected.toFixed(5)}A, \tBatt1: ${currents.battery1NetCorrected.toFixed(5)}A, \tBatt2: ${currents.battery2NetCorrected.toFixed(5)}A`);
        }

        const main_sensor_readings = {
            I_batt_main: batt1_net,
            I_batt_alternate: batt2_net,
            I_mppt: mppt_out,
            I_load: load_in,
            V_batt_main: batt1_v,
            V_batt_alternate: batt2_v
        };

        if (batt1_v > BATT_CUTOFF_VOLTAGE) {
            const { name, state, state_vector, rc, voltageEstimate, voltageResidual, netCurrent } = await main_battery.update({
                dt: time_diff_us / 1e6,
                voltage: batt1_v,
                netCurrent: currents.battery1NetCorrected,
            }, sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0);

            if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0) {
                if (SAVE_STATES_TO_DB) {
                    await insertMainBatteryState(current_run_id, state_vector, state.covariance, main_sensor_readings);
                }
                console.log(`Counter: ${sample_count}, \tSoC Main: ${(100 * state_vector.soc).toFixed(5)}%, \tCorrected Main: ${voltageEstimate.toFixed(5)}V, \tCurrent Main: ${currents.battery1NetCorrected.toFixed(5)}A, \tVoltage Residual: ${voltageResidual.toFixed(5)}V`);
                streamPowerData(Date.now(), batt1_v, voltageEstimate);
            }
        }

        if (batt2_v > BATT_CUTOFF_VOLTAGE) {
            const { name, state, state_vector, rc, voltageEstimate, voltageResidual, netCurrent } = await alternate_battery.update({
                dt: time_diff_us / 1e6,
                voltage: batt2_v,
                netCurrent: currents.battery2NetCorrected,
            });
            if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0) {
                if (SAVE_STATES_TO_DB) {
                    await insertAlternateBatteryState(current_run_id, state_vector, state.covariance, alternate_sensor_readings);
                }
                console.log(`Counter: ${sample_count}, \tSoC Alternate: ${(100 * state_vector.soc).toFixed(5)}%, \tCorrected Alt: ${voltageEstimate.toFixed(5)}V, \tCurrent Alternate: ${currents.battery2NetCorrected.toFixed(5)}A, \tVoltage Residual: ${voltageResidual.toFixed(5)}V`);
            }
        }

        sample_count++;
        if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0 && SAVE_ADC_READINGS_TO_DB) {
            await insertSocSensorDataBulk(data_array);
            data_array = [];
            //console.log(`Total Current: ${total_current.toFixed(5)}A, Total Time: ${total_time.toFixed(5)}s`);
        }            

        
        if (sample_count % SAMPLE_INTERVAL_BEFORE_WRITE === 0 && SAMPLE_INTERVAL_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, SAMPLE_INTERVAL_MS)); // Simulate delay for real-time processing
        }
    } finally {
        activeUpdates--;
    }
}

function detectAndCorrectFlips(mppt_out, load_in, batt1_net, batt2_net, batt1_v, batt2_v) {
    if (batt1_v < BATT_CUTOFF_VOLTAGE) {
            batt1_v = 0;
            batt1_net = 0;
        }
        if (batt2_v < BATT_CUTOFF_VOLTAGE) {
            batt2_v = 0;
            batt2_net = 0;
        }

        if (load_in < -CURRENT_FLIP_THRESHOLD) {
            is_load_flipped = true;
            load_in = -load_in;
        }
        if (mppt_out < -CURRENT_FLIP_THRESHOLD) {
            is_mppt_flipped = true;
            mppt_out = -mppt_out;
        }

        if (batt1_net + batt2_net - load_in + mppt_out > 2) {
            if ((-batt1_net) + batt2_net - load_in + mppt_out < 1) {
                //console.warn(`KCL violation detected: ${(batt1_net).toFixed(5)} + ${batt2_net.toFixed(5)} - ${load_in.toFixed(5)} + ${mppt_out.toFixed(5)} = ${(batt1_net + batt2_net - load_in + mppt_out).toFixed(5)}`);
                batt1_net = -batt1_net; // Flip the sign of batt1_net to correct the KCL violation
            } else if (batt1_net + (-batt2_net) - load_in + mppt_out < 1) {
                //console.warn(`KCL violation detected: ${batt1_net.toFixed(5)} + ${(batt2_net).toFixed(5)} - ${load_in.toFixed(5)} + ${mppt_out.toFixed(5)} = ${(batt1_net + batt2_net - load_in + mppt_out).toFixed(5)}`);
                batt2_net = -batt2_net; // Flip the sign of batt2_net to correct the KCL violation
            } else {
                throw new Error("KCL violation due to miswiring of MPPT or Load current sensor detected and cannot be corrected. Check wiring.");
            }
        }
    return [mppt_out, load_in, batt1_net, batt2_net, batt1_v, batt2_v];
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