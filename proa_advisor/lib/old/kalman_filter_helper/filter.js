const { load_battery_constants } = require('./helper');
const { add_mtx, sub_mtx, inv_mtx2x2, mul_mtx, transpose_mtx } = require('./small_mtx');
const { getBatteryRC_SoC, getBatteryRC_OCV } = require('../../model/db');

/*
Sensor placement:
I_MPPT: Towards Battery(Always Positive)       A0      
I_Load: Towards load (Always Positive)         A1
I_batt_main: Out of battery (Positive if discharging)       A2
I_batt_alternate: Out of battery (Positive if discharging)  A3
*/

const INITIAL_SOC_VAR = 0.05 ** 2;
const INITIAL_REST_VAR = 0.005 ** 2;
const PROCESS_NOISE_RC = 0.001 ** 2;
const ADC_SAMPLING_RATE = 1000;   // Hz; Around 1000-1200 samples per second

const main_battery_values = {
    'type': null,
    'state_vector': new Float32Array(3),        // x -> [SoC, V_rest1, V_rest2]
    'covariance_matrix': new Float32Array(9),   // P
    'process_noise': new Float32Array(9),       // Q
    'measurement_noise': new Float32Array(4),   // R
    'battery_constants': null,
}

const alternate_battery_values = {
    'type': null,
    'state_vector': new Float32Array(3),
    'covariance_matrix': new Float32Array(9),
    'process_noise': new Float32Array(9),
    'measurement_noise': new Float32Array(4),
    'battery_constants': null,
}

function set_main_battery(battery_type) {
    //Select which chemistry battery is used for main battery calculation
    if (battery_type == 'main' || battery_type === 'alternate') {
        throw new Error("Use battery chemistry type, not battery role. Must be 'LiNMC', 'LiFePO4', etc.");
    }
    main_battery_values.type = battery_type;
}

function set_alternate_battery(battery_type) {
    if (battery_type == 'main' || battery_type === 'alternate') {
        throw new Error("Use battery chemistry type, not battery role. Must be 'LiNMC', 'LiFePO4', etc.");
    }
    alternate_battery_values.type = battery_type;
}

function get_SoC_process_noise(battery_role, time_diff) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;
    const sigma_i = values.battery_constants.sigma_i;
    const q_total = values.battery_constants.Q_total * 3600;   // Convert from Ah to As

    return (100 * sigma_i * time_diff / q_total) ** 2 +
        (1e-6) ** 2; // Add a small model uncertainty
}

async function initialise_filter(battery_role, initial_voltage) {
    // Initial time is based on esp32 startup timing
    if (battery_role != "main" && battery_role !== "alternate") {
        throw new Error("Invalid battery type. Must be 'main' or 'alternate' role.");
    }
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;
    const tableName = battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping";
    values.battery_constants = load_battery_constants(values.type);

    const rc_values = await getBatteryRC_OCV(initial_voltage, values.battery_constants.interval_factor, tableName);
    if (Math.abs(rc_values[0].OCV - initial_voltage) > 1.0) {
        throw new Error(`Initial voltage ${initial_voltage}V is not within the expected range for battery type ${values.type}.`);
    }
    if (rc_values.length === 0) {
        throw new Error(`No RC values found in DB for voltage ${initial_voltage}V and battery type ${values.type}. Ensure the database is populated with appropriate RC mapping data.`);
    }
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
    console.log(`Initialised ${battery_role} battery filter with SoC=${state_vector[0]}%, Voltage=${initial_voltage}V, OCV=${rc_value.OCV}V, R0=${rc_value.R0}Ω, R1=${rc_value.R1}Ω, R2=${rc_value.R2}Ω, Tau1=${rc_value.Tau1}s, Tau2=${rc_value.Tau2}s`);
}

async function predict_state(battery_role, battery_current, time_diff_us) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;

    const time_diff = time_diff_us / 1e6;   // Convert us to s
    values.process_noise[0] = get_SoC_process_noise(battery_role, time_diff);

    const state_vector = values.state_vector;

    // statevector: [SoC, V_rest1, V_rest2]
    const rc_values = await getBatteryRC_SoC(values.state_vector[0], battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping");
    //console.log(`Fetched RC values for SoC ${values.state_vector[0]}:`, rc_values);
    if (rc_values.length === 0) {
        throw new Error(`No RC values found in DB for SoC ${values.state_vector[0]} and battery type ${values.type}. Ensure the database is populated with appropriate RC mapping data.`);
    }
    const { OCV, R0, R1, R2, Tau1, Tau2 } = rc_values[0];

    // Decay factor
    const d1 = Math.exp(-time_diff / Tau1);
    const d2 = Math.exp(-time_diff / Tau2);

    // Propage to next state
    //console.log(`Predicting next state for ${battery_role} battery with current=${battery_current}A and time diff=${time_diff}s`);
    state_vector[0] -= (battery_current * time_diff) / (values.battery_constants.Q_total * 3600) * 100;  
    //console.log(`Predicted SoC before bounds check: ${state_vector[0]}`);
    state_vector[1] = state_vector[1] * d1 + (1 - d1) * battery_current * R1;
    state_vector[2] = state_vector[2] * d2 + (1 - d2) * battery_current * R2;
    if (Number.isNaN(state_vector[0])) {
        throw new Error("Predicted SoC is NaN. Check battery current and time difference values.");
    }
    values.state_vector.set(state_vector);

    const state_transition = new Float32Array(9); // Intermediate value, do not need to store
    state_transition[0] = 1;    // SoC depends on prev SoC
    state_transition[1] = 0;    // SoC does not depend on prev rest voltages
    state_transition[2] = 0;    // SoC does not depend on prev rest voltages
    state_transition[3] = 0;
    state_transition[4] = d1;   // Rest voltage 1 depends on prev rest voltage 1 with decay
    state_transition[5] = 0;    // etc...
    state_transition[6] = 0;
    state_transition[7] = 0;
    state_transition[8] = d2;

    // Intermediate mtx
    const state_transition_T = transpose_mtx(state_transition, 3, 3);
    const covariance_matrix = values.covariance_matrix;
    const process_noise = values.process_noise;

    // Update covariance matrix: P_pred = F × P × F_transpose + Q
    // F: state transition matrix; P: covariance matrix; Q: process noise
    const FxP = mul_mtx(state_transition, 3, 3, covariance_matrix, 3, 3);
    const FxPxF_t = mul_mtx(FxP, 3, 3, state_transition_T, 3, 3);
    const new_covariance = add_mtx(FxPxF_t, 3, 3, process_noise, 3, 3);
    values.covariance_matrix.set(new_covariance);

    return rc_values[0];
}

async function compute_innovation(battery_role, rc_value, I_batt_main, I_batt_alternate, I_mppt, I_load, V_terminal) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;
    //console.log("RC values used for innovation calculation:", rc_value);
    const { OCV, R0, R1, R2, Tau1, Tau2 } = rc_value;

    // Predicted measurements: V_predicted = OCV - R0×I_batt - x_pred[1] - x_pred[2]
    const batt_current = battery_role === "main" ? I_batt_main : I_batt_alternate;
    let V_pred = OCV - (batt_current) * R0 - values.state_vector[1] - values.state_vector[2];
    //console.log(`Predicted voltage: ${V_pred}V based on OCV=${OCV}V, R0=${R0}Ω, I_batt=${batt_current}A, V_rest1=${values.state_vector[1]}V, V_rest2=${values.state_vector[2]}V`);

    // Actual measurements
    let V_actual = V_terminal;

    // Innovation
    const innovation = new Float32Array(2);
    innovation[0] = V_actual - V_pred;

    //console.log(`Predicted voltage: ${V_pred}V, Actual voltage: ${V_actual}V, Voltage innovation: ${innovation[0]}V`);
    let I_model = (OCV - V_terminal - values.state_vector[1] - values.state_vector[2]) / R0;

    let I_kcl = I_mppt - I_load + I_batt_main + I_batt_alternate;

    innovation[1] = I_kcl - I_model;
    
    return innovation;
}

async function compute_measurement_jacobian(battery_role, rc_value) {
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;
    const { OCV, R0, R1, R2, Tau1, Tau2 } = rc_value;

    const H = new Float32Array(6);   // Measurement matrix, intermediate value

    // Row 0: How terminal voltage is affected by SoC and rest voltages
    const rc_values = await getBatteryRC_SoC(values.state_vector[0], battery_role === "main" ? "MainRCMapping" : "AlternateRCMapping", 3);
    let rc_high, rc_low;
    if (rc_values.length == 3) {
        rc_high = rc_values[2];
        rc_low = rc_values[0];
    } else if (rc_values.length == 2) {
        rc_high = rc_values[1];
        rc_low = rc_values[0];
    } else {
        throw new Error(`Not enough RC values for SoC ${values.state_vector[0]} returned from DB to compute measurement jacobian. Need at least 2 for slope calculation.`);
    }

    const dOCVdSoC = (rc_high.OCV - rc_low.OCV) / (rc_high.SoC - rc_low.SoC);
    H[0] = dOCVdSoC;   // How voltage changes with SoC changes
    H[1] = -1;   //V_RC directly subtracts from V
    H[2] = -1;

    // Row 1: how KCL residual depends on each state

    H[3] = -(dOCVdSoC / R0);
    H[4] = -1 / R0;
    H[5] = -1 / R0;

    /* H[3] = 0;
    H[4] = 0;
    H[5] = 0; */

    return H;
}

async function update({ battery_role, time_diff_us, I_batt_main, I_batt_alternate, I_mppt, I_load, V_terminal }) {
    I_mppt = -I_mppt;
    I_load = -I_load;
    // H: measurement jacobian; R: measurement noise covariance; x_pred: predicted state vector; P_pred: predicted covariance matrix
    const values = battery_role === "main" ? main_battery_values : alternate_battery_values;

    const battery_current = battery_role === "main" ? I_batt_main : I_batt_alternate;
    const old_soc = values.state_vector[0];
    const rc_value = await predict_state(battery_role, battery_current, time_diff_us);
    //console.log("Fetched RC value for update step:", rc_value);

    const x_pred = values.state_vector;
    const P_pred = values.covariance_matrix;
    const H = await compute_measurement_jacobian(battery_role, rc_value);
    const R = values.measurement_noise;

    // Innovation cov: S = H × P_pred × H_transpose + R
    let H_t = transpose_mtx(H, 2, 3);
    let HxP_pred = mul_mtx(H, 2, 3, P_pred, 3, 3); // returns 2x3
    let HxP_predxH_t = mul_mtx(HxP_pred, 2, 3, H_t, 3, 2);
    let innovation_cov = add_mtx(HxP_predxH_t, 2, 2, R, 2, 2);

    // Kalman gain: K = P_pred × H_transpose × S^-1
    let S_inv = inv_mtx2x2(innovation_cov);
    let P_predxH_t = mul_mtx(P_pred, 3, 3, H_t, 3, 2);
    let K = mul_mtx(P_predxH_t, 3, 2, S_inv, 2, 2);
    //console.log("Kalman Gain K:", K);

    // Updated state: x_updated = x_pred + K × innovation
    let innovation = await compute_innovation(battery_role, rc_value, I_batt_main, I_batt_alternate, I_mppt, I_load, V_terminal);
    //console.log("Innovation:", innovation);
    let KxInnovation = mul_mtx(K, 3, 2, innovation, 2, 1);
    //console.log("K x innovation:", KxInnovation);
    let x_updated = add_mtx(x_pred, 3, 1, KxInnovation, 3, 1);

    /* console.log({
        innovationV: innovation[0],
        innovationKCL: innovation[1],
        socCorrection: KxInnovation[0]
    }); */

    // Restrict SoC to [0, 1]
    //console.log("Updated SoC before bounds check:", x_updated[0]);
    x_updated[0] = Math.max(0.0, Math.min(100.0, x_updated[0]));
    //console.log("Updated SoC after bounds check:", x_updated[0]);
    //console.log();
    // Update cov using Joseph form (numerically stable): P_updated = (I - K × H) × P_pred × (I - K × H)_transpose + K × R × K_transpose
    let I = new Float32Array(9);
    I[0] = 1; I[1] = 0; I[2] = 0;
    I[3] = 0; I[4] = 1; I[5] = 0;
    I[6] = 0; I[7] = 0; I[8] = 1;

    let KH = mul_mtx(K, 3, 2, H, 2, 3);
    let I_minus_KH = sub_mtx(I, 3, 3, KH, 3, 3);
    let I_minus_KH_T = transpose_mtx(I_minus_KH, 3, 3);

    let I_minus_KHxP_pred = mul_mtx(I_minus_KH, 3, 3, P_pred, 3, 3);
    let I_minus_KHxP_predxI_minus_KH_T = mul_mtx(I_minus_KHxP_pred, 3, 3, I_minus_KH_T, 3, 3);

    let KR = mul_mtx(K, 3, 2, R, 2, 2);
    let KRxK_T = mul_mtx(KR, 3, 2, transpose_mtx(K, 3, 2), 2, 3);

    let P_updated = add_mtx(I_minus_KHxP_predxI_minus_KH_T, 3, 3, KRxK_T, 3, 3);

    // Store updated state and covariance
    if (Number.isNaN(x_updated[0])) {
        throw new Error("Updated SoC is NaN. Check innovation and Kalman gain values.");
    }
    values.state_vector.set(x_updated);
    values.covariance_matrix.set(P_updated);
/*     console.log({
        soc_before_predict: old_soc,
        soc_after_predict: x_pred[0],
        innovation_voltage: innovation[0],
        kalman_soc_correction: KxInnovation[0],
        soc_after_update: x_updated[0]
    }); */

    /* console.log({
        soc: values.state_vector[0],
        P_soc: values.covariance_matrix[0],
        K_soc_voltage: K[0],
        K_soc_kcl: K[1],
        dOCVdSoC: H[0]
    }); */

    return [values.state_vector, values.covariance_matrix, values.process_noise];
}

module.exports = {
    set_main_battery,
    set_alternate_battery,
    initialise_filter,
    update
}