
const V_REF = 4.096;    // Fixed internal voltage reference

function adc_to_voltage(adc_value, range) {
    let fs = null;
    switch (range) {
        case 0: fs = 2.5 * V_REF; break;
        case 1: fs = 1.25 * V_REF; break;
        case 2: fs = 0.625 * V_REF; break;
        case 3: fs = 0.3125 * V_REF; break;
        case 4: fs = 0.15625 * V_REF; break;
        case 5: fs = 2.5 * V_REF; break;
        case 6: fs = 1.25 * V_REF; break;
        case 7: fs = 0.625 * V_REF; break;
        case 8: fs = 0.3125 * V_REF; break;
        default: throw new Error("Invalid range. Must be an integer between 0 and 8.");
    }
    if (range >= 0 && range <= 4) {
        const offset = adc_value - 32768;
        return (offset / 32768) * fs;
    } else {
        return (adc_value / 65536) * fs;
    }
}

function adc_to_current(adc_value, range) {
    const voltage = adc_to_voltage(adc_value, range);

    // Calibrated quadratic fn for HE Sensor measured on 16 bit ADC
    const a = -0.0001232378890506735;
    const b = 0.06268986789356691;
    const mid_pt = 32768;
    if (adc_value >= mid_pt) {
        return (-b + Math.sqrt(b * b + 4 * a * voltage)) / (2 * a);
    } else {
        return (-b + Math.sqrt(b * b - 4 * a * voltage)) / (2 * a);
    }
}

module.exports = {
    adc_to_voltage,
    adc_to_current
}