const { getDB } = require('./power_management_models');
const { withWriteLock } = require('./write_lock');

function runSQL(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err); else resolve(this);
        });
    });
}

function runStmt(stmt, params) {
    return new Promise((resolve, reject) => {
        stmt.run(params, function (err) {
            if (err) reject(err); else resolve(this);
        });
    });
}

function finalizeStmt(stmt) {
    return new Promise((resolve) => {
        stmt.finalize((err) => {
            if (err) console.error('Error finalizing IMU stmt:', err.message);
            resolve();
        });
    });
}

/**
 * Bulk insert IMU telemetry data in a single transaction.
 * Each item in dataArray should have: { run_id, counter, baseRoll, basePitch, topRoll, topPitch,
 *   topMinusBaseRoll, topMinusBasePitch, vectorAngle, bendMagnitude, topSeq, topConnected,
 *   sensingEnabled, zeroReady, recv_ms }
 *
 * Every row goes in one transaction with one prepared statement, mirroring the
 * power path's insertAllStatesAndReadings: separate transactions per row cost
 * far more than the serial reader can absorb.
 *
 * Rejects if any row failed, so a schema or constraint problem surfaces instead
 * of being logged and reported as a successful write.
 */
async function insertIMUDataBulk(dataArray) {
    if (!dataArray || dataArray.length === 0) return 0;
    // Shared connection: hold the write lock so this transaction cannot
    // interleave with the power or strain ones.
    return withWriteLock(() => insertIMUBatch(dataArray));
}

async function insertIMUBatch(dataArray) {
    const db = getDB();

    await runSQL(db, 'BEGIN TRANSACTION');
    const stmt = db.prepare(`
        INSERT INTO IMUReadings (run_id, counter, baseRoll, basePitch, topRoll, topPitch,
            topMinusBaseRoll, topMinusBasePitch, vectorAngle, bendMagnitude, topSeq,
            topConnected, sensingEnabled, zeroReady, recv_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // allSettled so every queued row finishes before the statement is finalized.
    const results = await Promise.allSettled(
        dataArray.map((d) => runStmt(stmt, [
            d.run_id, d.counter, d.baseRoll, d.basePitch, d.topRoll, d.topPitch,
            d.topMinusBaseRoll, d.topMinusBasePitch, d.vectorAngle, d.bendMagnitude,
            d.topSeq, d.topConnected ? 1 : 0, d.sensingEnabled ? 1 : 0, d.zeroReady ? 1 : 0,
            d.recv_ms ?? null
        ]))
    );
    await finalizeStmt(stmt);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        await runSQL(db, 'ROLLBACK').catch(() => {});
        throw new Error(`${failed.length}/${dataArray.length} IMU rows failed: ${failed[0].reason.message}`);
    }

    await runSQL(db, 'COMMIT');
    return dataArray.length;
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
