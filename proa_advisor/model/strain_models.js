const { getDB } = require('./power_management_models');
const { ensureColumn } = require('./schema_utils');

let tableInitialized = false;

function initializeStrainTable() {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS StrainReadings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id INTEGER NOT NULL,
                    counter INTEGER,
                    adjustedReading INTEGER,
                    recv_ms INTEGER,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Error creating StrainReadings table:', err.message);
                    reject(err);
                    return;
                }
                tableInitialized = true;
            });

            db.run(`
                CREATE INDEX IF NOT EXISTS idx_strain_run_id_id
                ON StrainReadings (run_id, id)
            `, (err) => {
                if (err) {
                    console.error('Error creating StrainReadings index:', err.message);
                    reject(err);
                    return;
                }
                // CREATE TABLE IF NOT EXISTS is a no-op on a database that
                // predates recv_ms, which would make every insert fail on the
                // missing column. Backfill it the same way IMUReadings does.
                ensureColumn('StrainReadings', 'recv_ms', 'INTEGER')
                    .then(() => resolve())
                    .catch(reject);
            });
        });
    });
}

function isStrainTableReady() {
    return tableInitialized;
}

module.exports = {
    initializeStrainTable,
    isStrainTableReady
};
