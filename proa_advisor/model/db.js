const { db, initializeDatabase, initialiseDBifNeeded } = require('./power_management_models');
const { soc_to_index } = require('../lib/EKF/helper');

async function insertSocSensorData(timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6) {
    await initialiseDBifNeeded();
    db.serialize(() => {
        db.run(`
            INSERT INTO SOCSensor (timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6], function (err) {
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
            INSERT INTO SOCSensor (timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        dataArray.forEach(({ timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6 }) => {
            stmt.run([timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6], function (err) {
                if (err) {
                    console.error('Error inserting SOC sensor data:', err.message);
                }
            });
        });
    });
}

async function insertSocLastOffset(adc1Offset, adc2Offset, adc3Offset, adc4Offset, adc5Offset, adc6Offset) {
    await initialiseDBifNeeded();
    db.serialize(() => {
        db.run(`
            INSERT INTO SOCLastOffset (adc1Offset, adc2Offset, adc3Offset, adc4Offset, adc5Offset, adc6Offset)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [adc1Offset, adc2Offset, adc3Offset, adc4Offset, adc5Offset, adc6Offset], function (err) {
            if (err) {
                console.error('Error inserting SOC last offset data:', err.message);
            }
        });
    });
}

async function insertBatteryState(soc, v_rc1, v_rc2, err_cov) {
    await initialiseDBifNeeded();
    db.serialize(() => {
        db.run(`
            INSERT INTO BatteryState (SoC, v_rc1, v_rc2, err_cov)
            VALUES (?, ?, ?, ?)
        `, [soc, v_rc1, v_rc2, err_cov], function (err) {
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
    console.log(tableName, soc, index, start_index, end_index);
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

module.exports = {
    insertSocSensorData,
    insertSocSensorDataBulk,
    insertSocLastOffset,
    insertBatteryState,
    getBatteryRC_SoC,
    getBatteryRC_OCV,
    getLastBatteryState
};
