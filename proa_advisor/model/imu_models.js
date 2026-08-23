const { getDB } = require('./power_management_models');

let tableInitialized = false;

function initializeIMUTable() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS IMUReadings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    counter INTEGER,
                    baseRoll REAL,
                    basePitch REAL,
                    topRoll REAL,
                    topPitch REAL,
                    topMinusBaseRoll REAL,
                    topMinusBasePitch REAL,
                    vectorAngle REAL,
                    bendMagnitude REAL,
                    topSeq INTEGER,
                    topConnected INTEGER,
                    sensingEnabled INTEGER,
                    zeroReady INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating IMUReadings table:', err.message);
                    reject(err);
                } else {
                    tableInitialized = true;
                }
            });

            db.run(`
                CREATE INDEX IF NOT EXISTS idx_imu_run_id_id
                ON IMUReadings (run_id, id)
            `, (err) => {
                if (err) {
                    console.error('Error creating IMUReadings index:', err.message);
                } else {
                    resolve();
                }
            });
        });
    });
}

function isIMUTableReady() {
    return tableInitialized;
}

module.exports = {
    initializeIMUTable,
    isIMUTableReady
};
