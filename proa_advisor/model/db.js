const { db, initializeDatabase, initialiseDBifNeeded } = require('./power_management_models');
const { soc_to_index } = require('../lib/kalman_filter_helper/helper');

async function insertSocSensorData(run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7) {
    await initialiseDBifNeeded();
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
    await initialiseDBifNeeded();
    db.serialize(() => {
        const stmt = db.prepare(`
            INSERT INTO SOCSensor (run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        dataArray.forEach(({ run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7 }) => {
            stmt.run([run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7], function (err) {
                if (err) {
                    console.error('Error inserting SOC sensor data:', err.message);
                }
            });
        });
    });
}

async function insertBatteryState(run_id, state_vector, covariance_matrix, process_noise) {
    await initialiseDBifNeeded();
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

async function getBatteryRC_SoC(soc, tableName, count=1) {
    await initialiseDBifNeeded();
    if (tableName !== "MainRCMapping" && tableName !== "AlternateRCMapping") {
        throw new Error("Invalid table name. Must be 'MainRCMapping' or 'AlternateRCMapping'.");
    }

    const half = Math.floor(count / 2);
    const index = soc_to_index(soc);
    const start_index = Math.max(0, index - half);
    const end_index = index + half;
    // console.log(tableName, soc, index, start_index, end_index);
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM ${tableName} 
                WHERE rowId BETWEEN ? AND ? 
        `, [start_index, end_index], (err, row) => {
            if (err) {
                console.error('Error retrieving battery RC data:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function getBatteryRC_OCV(voltage, factor, tableName, count=1) {
    await initialiseDBifNeeded();
    if (tableName !== "MainRCMapping" && tableName !== "AlternateRCMapping") {
        throw new Error("Invalid table name. Must be 'MainRCMapping' or 'AlternateRCMapping'.");
    }

    const table_size = 10 ** (factor + 2) + 1;
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * From ${tableName}
                WHERE OCV = (
                    SELECT OCV FROM ${tableName}
                    ORDER BY ABS(OCV - ?) ASC
                    LIMIT ?
                )`
        , [voltage, count], (err, row) => {
            if (err) {
                console.error('Error retrieving battery RC data:', err.message);
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
}

async function getLastBatteryState() {
    await initialiseDBifNeeded();
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
    await initialiseDBifNeeded();
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
