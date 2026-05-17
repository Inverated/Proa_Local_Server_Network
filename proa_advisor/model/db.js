const { db, initializeDatabase } = require('./power_management_models');

function insertSocSensorData(timeSinceSensorStart, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6) {
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

function insertSocSensorDataBulk(dataArray) {
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

function insertSocLastOffset(adc1Offset, adc2Offset, adc3Offset, adc4Offset, adc5Offset, adc6Offset) {
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

function insertBatteryState(soc, v_rc1, v_rc2, err_cov) {
    db.serialize(() => {
        db.run(`
            INSERT INTO BatteryState (soc, v_rc1, v_rc2, err_cov)
            VALUES (?, ?, ?, ?)
        `, [soc, v_rc1, v_rc2, err_cov], function (err) {
            if (err) {
                console.error('Error inserting battery state data:', err.message);
            }
        });
    });
}

