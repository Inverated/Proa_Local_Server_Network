const { load_battery_constants, soc_to_index } = require('./helper');
const { add_mtx, inv_mtx2x2, mul_mtx, transpose_mtx } = require('./small_mtx');
const { getBatteryRC_SoC, getBatteryRC_OCV, getLastBatteryState, insertBatteryState, insertSocLastOffset, insertSocSensorData, insertSocSensorDataBulk } = require('../../model/db');

/*
Sensor placement:
I_MPPT: Out to batteries (Positive)
I_Load: Into load (Positive)
I_batt_main: Into battery (Positive if charging)
I_batt_alternate: Into battery (Positive if charging)
*/

const INITIAL_SOC_VAR = 0.05;
const INITIAL_REST_VAR = 0.005;
const PROCESS_NOISE_RC = 0.001**2;
const ADC_SAMPLING_RATE = 500;   // Hz

const main_battery_values = {
    'type': null,
    'state_vector': new Float32Array(3),        // x -> [SoC, V_rest1, V_rest2]
    'covariance_matrix': new Float32Array(9),   // P
    'process_noise': new Float32Array(9),       // Q
    'measurement_noise': new Float32Array(4),   // R
    'last_timestamp_ms': 0,
    'battery_constants': null,
    'sample_count': 0.0,
}

const alternate_battery_values = {
    'type': null,
    'state_vector': new Float32Array(3),
    'covariance_matrix': new Float32Array(9),
    'process_noise': new Float32Array(9),
    'measurement_noise': new Float32Array(4),
    'last_timestamp_ms': 0,
    'battery_constants': null,
    'sample_count': 0.0,
}

function set_main_battery(battery_type) {
    if (battery_type == 'main' || battery_type === 'alternate') {
        throw new Error("Use battery chemistry type, not battery role. Must be 'LiNMC', 'LiFePO4', etc.");
    }
    main_battery_values.type = battery_type;
}

function set_alternate_battery(battery_type) {
    alternate_battery_values.type = battery_type;
}

function get_SoC_process_noise(battery_role, time_diff) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;
    const sigma_i = values.battery_constants.sigma_i;
    const q_total = values.battery_constants.Q_total * 3600;   // Convert from Ah to As
    return (sigma_i * time_diff / q_total) ** 2;
}

async function initialise_filter(battery_role, initial_voltage, initial_time_ms) {
    // Initial time is based on esp32 startup timing
    if (battery_role != "main" && battery_role !== "alternate") {
        throw new Error("Invalid battery type. Must be 'main' or 'alternate' role.");
    }
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;
    const tableName = battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping";

    values.battery_constants = load_battery_constants(values.type);

    const rc_values = await getBatteryRC_OCV(initial_voltage, values.battery_constants.interval_factor, tableName);
    const rc_value = rc_values[0];

    const state_vector = values.state_vector;
    state_vector[0] = rc_value.SoC;
    state_vector[1] = 0;    // Assume fully rested at startup
    state_vector[2] = 0;    // Update this to take into account prev startup time later

    // Will adjust itself over time
    const covariance_matrix = values.covariance_matrix;
    covariance_matrix[0] = INITIAL_SOC_VAR;
    covariance_matrix[1] = 0;
    covariance_matrix[2] = 0;
    covariance_matrix[3] = 0;
    covariance_matrix[4] = INITIAL_REST_VAR;
    covariance_matrix[5] = 0;
    covariance_matrix[6] = 0;
    covariance_matrix[7] = 0;
    covariance_matrix[8] = INITIAL_REST_VAR;

    // Need to fine tune if varies a lot
    // Does not adjust itself
    const process_noise = values.process_noise;
    const initial_time_diff = 1.0 / ADC_SAMPLING_RATE;
    process_noise[0] = get_SoC_process_noise(battery_role, initial_time_diff);
    process_noise[1] = 0;
    process_noise[2] = 0;
    process_noise[3] = 0;
    process_noise[4] = PROCESS_NOISE_RC;
    process_noise[5] = 0;
    process_noise[6] = 0;
    process_noise[7] = 0;
    process_noise[8] = PROCESS_NOISE_RC;

    const measurement_noise = values.measurement_noise;
    measurement_noise[0] = values.battery_constants.sigma_v ** 2;
    measurement_noise[1] = 0;
    measurement_noise[2] = 0;
    measurement_noise[3] = values.battery_constants.sigma_kcl ** 2; 
    
    values.last_timestamp_ms = initial_time_ms;

    await compute_kalman_gain(battery_role);
    console.log(`Initialised ${battery_role} battery filter with SoC: ${state_vector[0]}`);
}

async function predict_state(battery_role, current, timestamp_ms) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;

    time_diff = (timestamp_ms - values.last_timestamp_ms) / 1000.0;   // Convert ms to s

    const state_vector = values.state_vector;
    const rc_values = await getBatteryRC_SoC(values.state_vector[0], battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping");
    const { OCV, R0, R1, R2, Tau1, Tau2 } = rc_values[0];

    // Decay factor
    d1 = np.exp(-time_diff / Tau1);
    d2 = np.exp(-time_diff / Tau2);

    // Propage to next state
    state_vector[0] = state_vector[0] - (current * time_diff) / (values.battery_constants.Q_total * 3600);
    state_vector[1] = state_vector[1] * d1 + (1 - d1) * current * R1;
    state_vector[2] = state_vector[2] * d2 + (1 - d2) * current * R2;

    const jacobian = new Float32Array(9); // Intermediate value, do not need to store
    jacobian[0] = 1;    // SoC depends on prev SoC
    jacobian[1] = 0;    // SoC does not depend on prev rest voltages
    jacobian[2] = 0;    // SoC does not depend on prev rest voltages
    jacobian[3] = 0;
    jacobian[4] = d1;   // Rest voltage 1 depends on prev rest voltage 1 with decay
    jacobian[5] = 0;    // etc...
    jacobian[6] = 0;
    jacobian[7] = 0;
    jacobian[8] = d2;

    // Update covariance matrix
    const jacobian_T = transpose_mtx(jacobian, 3, 3);
    const covariance_matrix = values.covariance_matrix;
    const process_noise = values.process_noise;

    const FxP = mul_mtx(jacobian, 3, 3, covariance_matrix, 3, 3);
    const FxPxF_t = mul_mtx(FxP, 3, 3, jacobian_T, 3, 3);
    const new_covariance = add_mtx(FxPxF_t, process_noise, 3, 3);
    values.covariance_matrix.set(new_covariance);

    values.last_timestamp_ms = timestamp_ms;
} 

async function compute_innovation(battery_role, I_batt_main, I_batt_alternate, I_mppt, I_load, V_terminal) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;

    const rc_values = await getBatteryRC_SoC(values.state_vector[0], battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping");
    const { OCV, R0, R1, R2, Tau1, Tau2 } = rc_values[0];

    // Predicted measurements
    const batt_current = battery_role === "main" ? I_batt_main : I_batt_alternate;
    V_pred = OCV - values.state_vector[1] - values.state_vector[2] - batt_current * R0;
    KCL_pred = 0    // Should be 0 in an ideal model

    // Actual measurements
    V_actual = V_terminal;
    KCL_actual = I_mppt - I_load - I_batt_main - I_batt_alternate;

    // Innovation
    const innovation = new Float32Array(2);
    innovation[0] = V_actual - V_pred;
    innovation[1] = KCL_actual - KCL_pred;

    return innovation;
}

async function compute_kalman_gain(battery_role) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;

    const H = new Float32Array(6);   // Measurement matrix, intermediate value
    
    // Row 0: How terminal voltage is affected by SoC and rest voltages
    const rc_values = await getBatteryRC_SoC(values.state_vector[0], battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping", count = 3);
    H[0] = (rc_values[2].OCV - rc_values[0].OCV) / (rc_values[2].SoC - rc_values[0].SoC);
    H[1] = -1   //V_RC directly subtracts from V
    H[2] = -1;
    
    // Row 1: how KCL residual depends on each state
    // Basically does not depend on SoC or rest voltages
    H[3] = 0;
    H[4] = 0;
    H[5] = 0;

    return H;
}


module.exports = {
    set_main_battery,
    set_alternate_battery,
    initialise_filter
}