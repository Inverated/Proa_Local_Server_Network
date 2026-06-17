'use strict';

const { KalmanFilter } = require('kalman-filter');

function diag(values) {
    return values.map((v, i) => {
        const row = Array(values.length).fill(0);
        row[i] = v;
        return row;
    });
}

class CurrentKCLCorrector {
    constructor(options = {}) {
        this.noise = {
            kcl: options.noise?.kcl ?? 1e-4,

            // Tune these.
            // Larger = this sensor is allowed to drift more.
            bLoadProcess: options.noise?.bLoadProcess ?? 1e-9,
            bChargeProcess: options.noise?.bChargeProcess ?? 1e-7,
            bBat1Process: options.noise?.bBat1Process ?? 1e-7,
            bBat2Process: options.noise?.bBat2Process ?? 1e-7,
        };

        this.initial = {
            bLoad: options.initial?.bLoad ?? 0,
            bCharge: options.initial?.bCharge ?? 0,
            bBat1: options.initial?.bBat1 ?? 0,
            bBat2: options.initial?.bBat2 ?? 0,
        };

        this.initialCovariance = options.initialCovariance || diag([
            0.05, // bLoad uncertainty
            0.05, // bCharge uncertainty
            0.05, // bBat1 uncertainty
            0.05, // bBat2 uncertainty
        ]);

        this.ctx = null;
        this.kf = null;
        this.previousCorrected = null;
        this.isActive = {
            load: true,
            charge: true,
            bat1: true,
            bat2: true,
        }
    }

    init() {
        this.kf = new KalmanFilter({
            dynamic: {
                dimension: 4,

                // Biases are random-walk states.
                fn: ({ previousCorrected }) => {
                    return previousCorrected.mean;
                },

                transition: () => [
                    [1, 0, 0, 0],
                    [0, 1, 0, 0],
                    [0, 0, 1, 0],
                    [0, 0, 0, 1],
                ],

                covariance: () => {
                    const dt = this.ctx?.dt ?? 1;
                    return diag([
                        this.isActive.load ? this.noise.bLoadProcess * dt : 0,
                        this.isActive.charge ? this.noise.bChargeProcess * dt : 0,
                        this.isActive.bat1 ? this.noise.bBat1Process * dt : 0,
                        this.isActive.bat2 ? this.noise.bBat2Process * dt : 0,
                    ]);
                },

                init: {
                    mean: [
                        [this.initial.bLoad],
                        [this.initial.bCharge],
                        [this.initial.bBat1],
                        [this.initial.bBat2],
                    ],
                    covariance: this.initialCovariance,
                },
            },

            observation: {
                dimension: 1,

                // Pseudo measurement:
                // z = 0
                //
                // h(x) = rawKcl - bLoad + bCharge + bBat1 + bBat2
                fn: ({ predicted }) => {
                    const bLoad = predicted.mean[0][0];
                    const bCharge = predicted.mean[1][0];
                    const bBat1 = predicted.mean[2][0];
                    const bBat2 = predicted.mean[3][0];

                    const h =
                        this.ctx.rawKcl
                        - bLoad
                        + bCharge
                        + bBat1
                        + bBat2;

                    return [[h]];
                },

                // dh/dbiases
                stateProjection: () => [
                    [this.isActive.load ? -1 : 0,
                    this.isActive.charge ? 1 : 0,
                    this.isActive.bat1 ? 1 : 0,
                    this.isActive.bat2 ? 1 : 0],
                ],

                covariance: () => [[this.noise.kcl]],
            },
        });

        this.previousCorrected = null;
        return this;
    }

    update(reading) {
        if (!this.kf) {
            throw new Error('Call init() on CurrentKCLCorrector first.');
        }

        const { dt, loadCurrent, chargeCurrent, battery1NetCurrent, battery2NetCurrent } = reading;

        this.ctx = {
            dt,
            rawKcl:
                loadCurrent
                - chargeCurrent
                - battery1NetCurrent
                - battery2NetCurrent,
        };

        const predicted = this.kf.predict({
            previousCorrected: this.previousCorrected,
        });

        const corrected = this.kf.correct({
            predicted,
            observation: [0],
        });

        this.previousCorrected = corrected;

        const bLoad = corrected.mean[0][0];
        const bCharge = corrected.mean[1][0];
        const bBat1 = corrected.mean[2][0];
        const bBat2 = corrected.mean[3][0];

        const loadCorrected = this.isActive.load ? loadCurrent - bLoad : 0;
        const chargeCorrected = this.isActive.charge ? chargeCurrent - bCharge : 0;
        const battery1NetCorrected = this.isActive.bat1 ? battery1NetCurrent - bBat1 : 0;
        const battery2NetCorrected = this.isActive.bat2 ? battery2NetCurrent - bBat2 : 0;

        
        const correctedKcl =
            loadCorrected
            - chargeCorrected
            - battery1NetCorrected
            - battery2NetCorrected;

        return {
            state: corrected,

            biases: {
                bLoad,
                bCharge,
                bBat1,
                bBat2,
            },

            currents: {
                loadCorrected,
                chargeCorrected,
                battery1NetCorrected,
                battery2NetCorrected,
            },

            diagnostics: {
                rawKcl: this.ctx.rawKcl,
                correctedKcl,
            },
        };
    }

    clampNoise(isActive) {
        this.isActive = isActive;
    }
}

module.exports = { CurrentKCLCorrector };