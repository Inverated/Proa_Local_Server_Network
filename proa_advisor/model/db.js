const { db, initializeDatabase } = require('./power_management_models');
const { soc_to_index } = require('../lib/kalman_filter_helper/helper');

async function insertSocSensorData(run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7) {
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

async function insertBatteryState(run_id, state_vector, covariance_matrix, process_noise) {
    db.serialize(() => {
        db.run(`
            INSERT INTO BatteryState (run_id, state_vector, covariance_matrix, process_noise)
            VALUES (?, ?, ?, ?)
        `, [run_id, state_vector, covariance_matrix, process_noise], function (err) {
            if (err) {
                console.error('Error inserting battery state data:', err.message);
            }
        });
    });
}

const persistent_main_RC = [];
const persistent_alternate_RC = [];

async function fetchAndCacheRC(tableName = "MainRCMapping") {
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

    const half = Math.floor(count / 2);
    const index = soc_to_index(soc);
    const start_index = Math.max(0, index - half);
    const end_index = index + half;

    const rc_data = await fetchAndCacheRC(tableName);
    const filtered = rc_data.slice(start_index, end_index + 1);
    if (Math.abs(soc - filtered[0].SoC) > 0.5) {
        console.error(`Requested SoC ${soc} is wrong`);
    }
    return filtered;
}

async function getBatteryRC_OCV(voltage, factor, tableName, count = 1) {
    if (tableName !== "MainRCMapping" && tableName !== "AlternateRCMapping") {
        throw new Error("Invalid table name. Must be 'MainRCMapping' or 'AlternateRCMapping'.");
    }
    const table_size = 10 ** (factor + 2) + 1;

    const rc_data = await fetchAndCacheRC(tableName);
    const sorted = rc_data.sort((a, b) => Math.abs(a.OCV - voltage) - Math.abs(b.OCV - voltage));
    return sorted.slice(0, count);
}

async function getLastBatteryState() {
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT * FROM BatteryState ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error retrieving last battery state data:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function getRunId(time_before_new_run = 5 * 60 * 1000) { // 5 minutes
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT run_id, timestamp FROM SOCSensor ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error retrieving last run_id:', err.message);
                reject(err);
            } else {
                if (!row) {
                    resolve(1); // No previous run, start with run_id 1
                    return;
                }
                const time_now = new Date();
                const time_last = new Date(row.timestamp);
                const time_diff = time_now - time_last;
                if (time_diff > time_before_new_run) {
                    resolve(row.run_id + 1); // Start new run
                } else {
                    resolve(row.run_id);
                }
            }
        });
    });
}

module.exports = {
    insertSocSensorData,
    insertSocSensorDataBulk,
    insertBatteryState,
    getBatteryRC_SoC,
    getBatteryRC_OCV,
    getLastBatteryState,
    getRunId
};
