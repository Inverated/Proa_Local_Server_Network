const { getDB, initializeDatabase } = require('./power_management_models');
const { soc_to_index } = require('../lib/kalman_filter_helper/helper');

async function insertSocSensorData(run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7) {
    const db = getDB();
    db.serialize(() => {
        db.run(`
            INSERT INTO SOCSensor (run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7], function (err) {
            if (err) {
                console.error('Error inserting SOC sensor data:', err.message);
            }
        });
    });
}

async function insertSocSensorDataBulk(dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO SOCSensor (run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            db.run('BEGIN TRANSACTION', (err) => {
                if (err) {
                    console.error('Error beginning transaction for SOCSensor bulk insert:', err.message);
                }
                let pending = dataArray.length;
                dataArray.forEach(({ run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7 }) => {
                    stmt.run([run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7], function (err) {
                        if (err) {
                            console.error('Error inserting SOC sensor data:', err.message);
                        }
                        pending--;
                        if (pending === 0) {
                            stmt.finalize((err) => {
                                if (err) {
                                    console.error('Error finalizing statement:', err.message);
                                }
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error('Error committing SOCSensor bulk insert:', err.message);
                                        reject(err);
                                    } else {
                                        resolve();
                                    }
                                });
                            });
                        }
                    });
                });
            });
        });
    });
}

async function insertMainBatteryState(run_id, state_vector, covariance_matrix, sensor_readings) {
    const db = getDB();
    db.serialize(() => {
        db.run(`
            INSERT INTO MainBatteryState (run_id, state_vector, covariance_matrix, sensor_readings)
            VALUES (?, ?, ?, ?)
        `, [run_id, JSON.stringify(state_vector), JSON.stringify(covariance_matrix), JSON.stringify(sensor_readings)], function (err) {
            if (err) {
                console.error('Error inserting main battery state data:', err.message);
            }
        });
    });
}

async function insertAlternateBatteryState(run_id, state_vector, covariance_matrix, sensor_readings) {
    const db = getDB();
    db.serialize(() => {
        db.run(`
            INSERT INTO AlternateBatteryState (run_id, state_vector, covariance_matrix, sensor_readings)
            VALUES (?, ?, ?, ?)
        `, [run_id, JSON.stringify(state_vector), JSON.stringify(covariance_matrix), JSON.stringify(sensor_readings)], function (err) {
            if (err) {
                console.error('Error inserting alternate battery state data:', err.message);
            }
        });
    });
}

async function insertKCLCorrectionState(run_id, biases, covariance_matrix) {
    const db = getDB();
    db.serialize(() => {
        db.run(`
            INSERT INTO KCL_Correctionstate (run_id, biases, covariance_matrix)
            VALUES (?, ?, ?)
        `, [run_id, JSON.stringify(biases), JSON.stringify(covariance_matrix)], function (err) {
            if (err) {
                console.error('Error inserting KCL correction state data:', err.message);
            }
        });
    });
}

const persistent_main_RC = [];
const persistent_alternate_RC = [];

async function fetchAndCacheRC(tableName = "MainRCMapping") {
    const db = getDB();
    if (tableName === "MainRCMapping") {

        if (persistent_main_RC.length > 0) {
            return persistent_main_RC;
        }
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM MainRCMapping ORDER BY SoC ASC`, [], (err, rows) => {
                if (err) {
                    console.error('Error retrieving main RC data:', err.message);
                    reject(err);
                } else {
                    persistent_main_RC.push(...rows);
                    resolve(rows);
                }
            });
        });
    } else if (tableName === "AlternateRCMapping") {
        if (persistent_alternate_RC.length > 0) {
            return persistent_alternate_RC;
        }
        return new Promise((resolve, reject) => {
            db.all(`SELECT * FROM AlternateRCMapping ORDER BY SoC ASC`, [], (err, rows) => {
                if (err) {
                    console.error('Error retrieving alternate RC data:', err.message);
                    reject(err);
                } else {
                    persistent_alternate_RC.push(...rows);
                    resolve(rows);
                }
            });
        });
    } else {
        throw new Error("Invalid table name. Must be 'MainRCMapping' or 'AlternateRCMapping'.");
    }
}


async function getBatteryRC_SoC(soc, tableName, count = 1) {
    if (tableName !== "MainRCMapping" && tableName !== "AlternateRCMapping") {
        throw new Error("Invalid table name. Must be 'MainRCMapping' or 'AlternateRCMapping'.");
    }

    const rc_data = await fetchAndCacheRC(tableName);
    let filtered = null;

    if (1 - soc < 0.00001) {
        filtered = rc_data.slice(-count);
    } else if (soc < 0.00001) {
        filtered = rc_data.slice(0, count);
    } else {
        const half = Math.floor(count / 2);
        const index = soc_to_index(soc);
        const start_index = Math.max(0, index - half);
        
        const end_index = index + half;
        
        filtered = rc_data.slice(start_index, end_index + 1);
    }

    if (Math.abs(soc - filtered[0].SoC) > 0.05 || (filtered[0].SoC < 1e-10 && soc > 0)) {
        console.error(`Requested SoC ${soc.toFixed(40)} is wrong. Received ${filtered[0].SoC.toFixed(40)} from database.`);
    }
    //console.log(filtered)
    return filtered;
}

async function getBatteryRC_OCV(voltage, factor, tableName, count = 1) {
    //console.log(`Fetching RC values for voltage: ${voltage.toFixed(4)}V, factor: ${factor}, table: ${tableName}, count: ${count}`);
    if (tableName !== "MainRCMapping" && tableName !== "AlternateRCMapping") {
        throw new Error("Invalid table name. Must be 'MainRCMapping' or 'AlternateRCMapping'.");
    }
    const table_size = 10 ** (factor + 2) + 1;

    const rc_data = await fetchAndCacheRC(tableName);
    
    const sorted = rc_data.sort((a, b) => Math.abs(a.OCV - voltage) - Math.abs(b.OCV - voltage));
    const sliced = sorted.slice(0, count);
    return sliced;
}

async function getLastMainBatteryState() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM MainBatteryState ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error retrieving last main battery state data:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function getLastAlternateBatteryState() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM AlternateBatteryState ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error retrieving last alternate battery state data:', err.message);
                reject(err);
            }
            else {
                resolve(row);
            }
        });
    });
}

async function getLastKCLCorrectionState() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM KCL_Correctionstate ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error retrieving last KCL correction state data:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function getRunId(time_before_new_run = 5 * 60 * 1000) { // 5 minutes
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT run_id, timestamp FROM MainBatteryState ORDER BY timestamp DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error retrieving last run_id:', err.message);
                reject(err);
            } else {
                if (!row) {
                    resolve({ run_id: 1, is_new: true }); // No previous run, start with run_id 1
                    return;
                }
                const time_now = new Date();
                const time_last = new Date(row.timestamp.replace(' ', 'T') + 'Z'); // Convert to ISO format for Date parsing
                const time_diff = time_now - time_last;
                
                if (time_diff > time_before_new_run) {
                    resolve({ run_id: row.run_id + 1, is_new: true }); // Start new run
                } else {
                    resolve({ run_id: row.run_id, is_new: false });
                }
            }
        });
    });
}

async function fetchStateAndSensorReadings(tableName = 'MainBatteryState', runId = null, count = 50) {
    // Only allow known state tables to avoid SQL injection via table name
    if (tableName !== 'MainBatteryState' && tableName !== 'AlternateBatteryState') {
        throw new Error("Invalid table name. Must be 'MainBatteryState' or 'AlternateBatteryState'.");
    }

    const db = getDB();

    return new Promise((resolve, reject) => {
        const sql = `SELECT id, run_id, timestamp, state_vector, sensor_readings FROM ${tableName} WHERE run_id = ? ORDER BY id ASC LIMIT ?`;
        db.all(sql, [runId, count], (err, rows) => {
            if (err) {
                console.error(`Error retrieving data from ${tableName} for run_id ${runId}:`, err.message);
                reject(err);
            } else {
                // Try to parse JSON if stored as TEXT
                const parsed = rows.map(r => {
                    let state_vector = r.state_vector;
                    let sensor_readings = r.sensor_readings;
                    try {
                        if (typeof state_vector === 'string') {
                            state_vector = JSON.parse(state_vector);
                        }
                    } catch (e) {
                        // leave as-is if parsing fails
                    }
                    try {
                        if (typeof sensor_readings === 'string') {
                            sensor_readings = JSON.parse(sensor_readings);
                        }
                    } catch (e) {
                        // leave as-is if parsing fails
                    }
                    return {
                        id: r.id,
                        run_id: r.run_id,
                        timestamp: r.timestamp,
                        state_vector,
                        sensor_readings
                    };
                });
                resolve(parsed);
            }
        });
    });
}

async function createOrUpdateRunInfo(run_id, total_runtime, total_load_W, total_mppt_W, total_batt1_net_W, total_batt2_net_W) {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.run(`
            INSERT INTO RunInfo (run_id, total_runtime, total_load_W, total_mppt_W, total_batt1_net_W, total_batt2_net_W)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(run_id)
            DO UPDATE SET
                total_runtime = excluded.total_runtime,
                total_load_W = excluded.total_load_W,
                total_mppt_W = excluded.total_mppt_W,
                total_batt1_net_W = excluded.total_batt1_net_W,
                total_batt2_net_W = excluded.total_batt2_net_W;
        `, [run_id, total_runtime, total_load_W, total_mppt_W, total_batt1_net_W, total_batt2_net_W], (err) => {
            if (err) {
                console.error('Error creating or updating run info:', err.message);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

async function getRunInfo(run_id) {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM RunInfo WHERE run_id = ?
        `, [run_id], (err, row) => {
            if (err) {
                console.error('Error retrieving run info:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

module.exports = {
    insertSocSensorData,
    insertSocSensorDataBulk,
    insertMainBatteryState,
    insertAlternateBatteryState,
    insertKCLCorrectionState,
    getBatteryRC_SoC,
    getBatteryRC_OCV,
    getLastMainBatteryState,
    getLastAlternateBatteryState,
    getRunId,
    fetchStateAndSensorReadings,
    getLastKCLCorrectionState,
    createOrUpdateRunInfo,
    getRunInfo
};
