const { getDB } = require('./power_management_models');

/**
 * Bulk insert IMU telemetry data in a single transaction.
 * Each item in dataArray should have: { run_id, counter, baseRoll, basePitch, topRoll, topPitch,
 *   topMinusBaseRoll, topMinusBasePitch, vectorAngle, bendMagnitude, topSeq, topConnected, sensingEnabled, zeroReady }
 */
async function insertIMUDataBulk(dataArray) {
    if (!dataArray || dataArray.length === 0) return;
    const db = getDB();

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            const stmt = db.prepare(`
                INSERT INTO IMUReadings (run_id, counter, baseRoll, basePitch, topRoll, topPitch,
                    topMinusBaseRoll, topMinusBasePitch, vectorAngle, bendMagnitude, topSeq,
                    topConnected, sensingEnabled, zeroReady)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            db.run('BEGIN TRANSACTION', (err) => {
                if (err) {
                    console.error('Error beginning IMU bulk insert transaction:', err.message);
                    reject(err);
                    return;
                }

                let pending = dataArray.length;
                dataArray.forEach((d) => {
                    stmt.run([
                        d.run_id, d.counter, d.baseRoll, d.basePitch, d.topRoll, d.topPitch,
                        d.topMinusBaseRoll, d.topMinusBasePitch, d.vectorAngle, d.bendMagnitude,
                        d.topSeq, d.topConnected ? 1 : 0, d.sensingEnabled ? 1 : 0, d.zeroReady ? 1 : 0
                    ], function (err) {
                        if (err) {
                            console.error('Error inserting IMU data:', err.message);
                        }
                        pending--;
                        if (pending === 0) {
                            stmt.finalize((err) => {
                                if (err) console.error('Error finalizing IMU stmt:', err.message);
                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error('Error committing IMU bulk insert:', err.message);
                                        reject(err);
                                    } else {
                                        resolve(dataArray.length);
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

/**
 * Get the last N IMU readings for a given run_id (for initial chart population).
 * Returns rows in ascending order (oldest first).
 */
async function getIMUDataByRunId(runId, limit = 1000) {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM IMUReadings
            WHERE run_id = ?
            ORDER BY id DESC
            LIMIT ?
        `, [runId, limit], (err, rows) => {
            if (err) {
                console.error('Error fetching IMU data:', err.message);
                reject(err);
            } else {
                resolve(rows ? rows.reverse() : []);
            }
        });
    });
}

/**
 * Get the latest run_id from IMUReadings table.
 */
async function getLatestIMURunId() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT run_id, timestamp FROM IMUReadings ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error fetching latest IMU run_id:', err.message);
                reject(err);
            } else {
                if (!row) {
                    resolve({ run_id: 1, is_new: true });
                } else {
                    const timeLast = new Date(row.timestamp.replace(' ', 'T') + 'Z');
                    const timeNow = new Date();
                    const diffMs = timeNow - timeLast;
                    // If more than 5 minutes gap, new run
                    if (diffMs > 5 * 60 * 1000) {
                        resolve({ run_id: row.run_id + 1, is_new: true });
                    } else {
                        resolve({ run_id: row.run_id, is_new: false });
                    }
                }
            }
        });
    });
}

module.exports = {
    insertIMUDataBulk,
    getIMUDataByRunId,
    getLatestIMURunId
};
