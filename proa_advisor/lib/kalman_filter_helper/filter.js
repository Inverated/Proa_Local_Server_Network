'use strict';

const { KalmanFilter } = require('kalman-filter');
const { getBatteryRC_SoC } = require('../../model/db');


function diag(values) {
    return values.map((v, i) => {
        const row = Array(values.length).fill(0);
        row[i] = v;
        return row;
    });
}

function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
}

function clampSocState(state) {
    state.mean[0][0] = clamp(state.mean[0][0], 0, 1);
}

function alphas(rc, dt) {
    return {
        a1: Math.exp(-dt / (rc.R1 * rc.C1)),
        a2: Math.exp(-dt / (rc.R2 * rc.C2)),
    };
}

class Battery2RCEKF {
    constructor(options) {
        this.name = options.name || 'main';

        this.capacityAh = options.capacityAh;
        this.Qn = this.capacityAh * 3600;

        this.noise = {
            socProcess: options.noise?.socProcess ?? 1e-22,
            rcProcess: options.noise?.rcProcess ?? 1e-22,
            voltage: options.noise?.voltage ?? 1e-8,
        };

        this.initial = {
            soc: options.initial.soc,
            v1: options.initial.v1,
            v2: options.initial.v2,
        };

        this.initialCovariance = options.initialCovariance || diag([
            1e-8,
            1e-8,
            1e-10,
        ]);

        this.ctx = null;
        this.kf = null;
        this.rc_values = null;
        this.previousCorrected = null;
    }

    async init() {
        this.rc_values = await getBatteryRC_SoC(this.initial.soc, this.name === "main" ? "MainRCMapping" : "AlternateRCMapping", 2);
        this.kf = new KalmanFilter({
            dynamic: {
                dimension: 3,

                fn: ({ previousCorrected }) => {
                    return this._stateFn(previousCorrected.mean);
                },

                transition: ({ previousCorrected }) => {
                    return this._stateJacobian(previousCorrected.mean);
                },

                covariance: () => {
                    const dt = this.ctx?.dt ?? 1;
                    return diag([
                        this.noise.socProcess * dt,
                        this.noise.rcProcess * dt,
                        this.noise.rcProcess * dt,
                    ]);
                },

                init: {
                    mean: [
                        [this.initial.soc],
                        [this.initial.v1],
                        [this.initial.v2],
                    ],
                    covariance: this.initialCovariance,
                },
            },

            observation: {
                dimension: 1,

                fn: ({ predicted }) => {
                    return this._measurementFn(predicted.mean);
                },

                stateProjection: ({ predicted }) => {
                    return this._measurementJacobian(predicted.mean);
                },

                covariance: () => [[this.noise.voltage]],
            },
        });

        this.previousCorrected = null;
        return this;
    }

    async update(reading, log=false) {
        if (!this.kf) {
            throw new Error(`Call init() on ${this.name} EKF first.`);
        }

        const { dt, voltage, netCurrent } = reading;

        if (!Number.isFinite(dt) || dt <= 0) {
            throw new Error(`${this.name}: dt must be positive.`);
        }

        if (!Number.isFinite(voltage)) {
            throw new Error(`${this.name}: voltage must be finite.`);
        }

        if (!Number.isFinite(netCurrent)) {
            throw new Error(`${this.name}: netCurrent must be finite.`);
        }

        this.ctx = { dt, voltage, netCurrent };

        const predicted = this.kf.predict({
            previousCorrected: this.previousCorrected || undefined,
        });

        clampSocState(predicted);

        const corrected = this.kf.correct({
            predicted,
            observation: [voltage],
        });

        clampSocState(corrected);
        log=false
        if (log) {
            console.log(`Previous corrected: ${this.previousCorrected ? this.previousCorrected.mean : 'null'}`);
        }

        this.previousCorrected = corrected;

        const soc = corrected.mean[0][0];
        const v1 = corrected.mean[1][0];
        const v2 = corrected.mean[2][0];
        this.rc_values = await getBatteryRC_SoC(soc, this.name === "main" ? "MainRCMapping" : "AlternateRCMapping", 2);

        const rc = this.rc_values[0];
        if (log) {
            console.log(`After predict`, predicted.mean, `After correct`, corrected.mean);
            console.log(rc.OCV, v1, v2, rc.R0 * netCurrent, predicted.mean, corrected.mean);
        }
        const voltageEstimate =
            rc.OCV
            - v1
            - v2
            - rc.R0 * netCurrent;

        return {
            name: this.name,
            state: corrected,

            state_vector: {
                soc,
                vrc1: v1,
                vrc2: v2,
            },

            rc,

            voltageEstimate,
            voltageResidual: voltage - voltageEstimate,

            netCurrent,
        };
    }

    _stateFn(mean) {
        const soc = mean[0][0];
        const v1 = mean[1][0];
        const v2 = mean[2][0];
        const rc = this.rc_values[0];
        const { a1, a2 } = alphas(rc, this.ctx.dt);

        const I = this.ctx.netCurrent;
        const socNext = soc - (I * this.ctx.dt) / (this.Qn);

        const v1Next = a1 * v1 + rc.R1 * (1 - a1) * I;
        const v2Next = a2 * v2 + rc.R2 * (1 - a2) * I;

        return [
            [clamp(socNext, 0, 1)],
            [v1Next],
            [v2Next],
        ];
    }

    _stateJacobian(mean) {
        const soc = mean[0][0];
        const rc = this.rc_values[0];
        const { a1, a2 } = alphas(rc, this.ctx.dt);

        // Practical approximation:
        // RC lookup is treated as locally constant during one timestep.
        return [
            [1, 0, 0],
            [0, a1, 0],
            [0, 0, a2],
        ];
    }

    _measurementFn(mean) {
        const soc = mean[0][0];
        const v1 = mean[1][0];
        const v2 = mean[2][0];

        const I = this.ctx.netCurrent;
        const rc = this.rc_values[0];
        const ocv = rc.OCV;

        const terminalVoltage =
            ocv
            - v1
            - v2
            - rc.R0 * I;

        return [[terminalVoltage]];
    }

    _measurementJacobian(mean) {
        const soc = mean[0][0];
        const rc_values = this.rc_values;

        if (rc_values.length < 2) {
            throw new Error(`Not enough RC values returned for Jacobian calculation at SoC ${soc}.`);
        }
        const rc_high = rc_values[1];
        const rc_low = rc_values[0];
        const dOCVdSoC = (rc_high.OCV - rc_low.OCV) / (rc_high.SoC - rc_low.SoC);
        //console.log(`dOCV/dSoC at SoC ${soc}: ${dOCVdSoC}`);

        return [[
            dOCVdSoC,
            -1,
            -1,
        ]];
    }
}

module.exports = { Battery2RCEKF };