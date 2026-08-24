const { getDB } = require('./power_management_models');
const { withWriteLock } = require('./write_lock');

// A gap larger than this between the newest stored row and now means the
// previous session ended, so a fresh run_id is issued. Matches the IMU rule.
const NEW_RUN_GAP_MS = 5 * 60 * 1000;

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
            if (err) console.error('Error finalizing strain stmt:', err.message);
            resolve();
        });
    });
}

/**
 * Bulk insert strain telemetry data in a single transaction.
 * Each item in dataArray should have: { run_id, counter, adjustedReading, recv_ms }
 *
 * Every row goes in one transaction with one prepared statement, mirroring the
 * power path's insertAllStatesAndReadings: separate transactions per row cost
 * far more than the serial reader can absorb.
 *
 * Rejects if any row failed, so a schema or constraint problem surfaces instead
 * of being logged and reported as a successful write.
 */
async function insertStrainDataBulk(dataArray) {
    if (!dataArray || dataArray.length === 0) return 0;
    // Shared connection: hold the write lock so this transaction cannot
    // interleave with the power or IMU ones.
    return withWriteLock(() => insertStrainBatch(dataArray));
}

async function insertStrainBatch(dataArray) {
    const db = getDB();

    await runSQL(db, 'BEGIN TRANSACTION');
    const stmt = db.prepare(`
        INSERT INTO StrainReadings (run_id, counter, adjustedReading, recv_ms)
        VALUES (?, ?, ?, ?)
    `);

    // allSettled so every queued row finishes before the statement is finalized.
    const results = await Promise.allSettled(
        dataArray.map((d) => runStmt(stmt, [d.run_id, d.counter, d.adjustedReading, d.recv_ms ?? null]))
    );
    await finalizeStmt(stmt);

    const failed = results.filter((r) => r.status === 'rejected');
    if (failed.length > 0) {
        await runSQL(db, 'ROLLBACK').catch(() => {});
        throw new Error(`${failed.length}/${dataArray.length} strain rows failed: ${failed[0].reason.message}`);
    }

    await runSQL(db, 'COMMIT');
    return dataArray.length;
}

/**
 * Get the last N strain readings for a given run_id (for initial chart population).
 * Returns rows in ascending order (oldest first).
 */
async function getStrainDataByRunId(runId, limit = 2000) {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.all(`
            SELECT * FROM StrainReadings
            WHERE run_id = ?
            ORDER BY id DESC
            LIMIT ?
        `, [runId, limit], (err, rows) => {
            if (err) {
                console.error('Error fetching strain data:', err.message);
                reject(err);
            } else {
                resolve(rows ? rows.reverse() : []);
            }
        });
    });
}

/**
 * Get the latest run_id from the StrainReadings table.
 * Returns { run_id, is_new } where is_new signals a new run was started.
 */
async function getLatestStrainRunId() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.get(`
            SELECT run_id, timestamp FROM StrainReadings ORDER BY id DESC LIMIT 1
        `, [], (err, row) => {
            if (err) {
                console.error('Error fetching latest strain run_id:', err.message);
                reject(err);
                return;
            }

            if (!row) {
                resolve({ run_id: 1, is_new: true });
                return;
            }

            const timeLast = new Date(row.timestamp.replace(' ', 'T') + 'Z');
            const diffMs = new Date() - timeLast;
            if (diffMs > NEW_RUN_GAP_MS) {
                resolve({ run_id: row.run_id + 1, is_new: true });
            } else {
                resolve({ run_id: row.run_id, is_new: false });
            }
        });
    });
}

module.exports = {
    insertStrainDataBulk,
    getStrainDataByRunId,
    getLatestStrainRunId
};
