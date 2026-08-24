const { getDB } = require('./power_management_models');

/**
 * Add a column to an existing table if it is not already present.
 *
 * SQLite has no "ADD COLUMN IF NOT EXISTS", so the current schema is inspected
 * with PRAGMA table_info first. Safe to call on every startup.
 *
 * Only pass trusted, hard-coded identifiers/definitions here - they are
 * interpolated into the statement because SQLite does not allow binding
 * parameters in DDL.
 *
 * @param {string} table Table name
 * @param {string} column Column name
 * @param {string} definition Column type/constraints, e.g. "INTEGER"
 * @returns {Promise<boolean>} true if the column was added, false if it already existed
 */
function ensureColumn(table, column, definition) {
    const db = getDB();
    return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, [], (err, rows) => {
            if (err) {
                console.error(`Error inspecting ${table} schema:`, err.message);
                reject(err);
                return;
            }

            // Table does not exist yet, the CREATE TABLE statement owns the column.
            if (!rows || rows.length === 0) {
                resolve(false);
                return;
            }

            if (rows.some((row) => row.name === column)) {
                resolve(false);
                return;
            }

            db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`, (alterErr) => {
                if (alterErr) {
                    console.error(`Error adding ${column} to ${table}:`, alterErr.message);
                    reject(alterErr);
                } else {
                    console.log(`Migrated ${table}: added column ${column}.`);
                    resolve(true);
                }
            });
        });
    });
}

module.exports = { ensureColumn };
