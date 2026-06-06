const sqlite3 = require('sqlite3').verbose();

const DB_PATH = './proa.db';
const fs = require('fs');
const csv = require('csv-parser');

const tables_initialized = {
    SOCSensor: false,
    MainBatteryState: false,
    AlternateBatteryState: false,
    MainRCMapping: false,
    AlternateRCMapping: false
};

let db = null;

async function startDB() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                reject(err);
            } else {
                initializeDatabase();
                console.log('Connected to SQLite database.');
                resolve(db);
            }
        })
    })
}

function getDB() {
    if (!db) {
        throw new Error('Database not initialized. Call startDB() first.');
    }
    return db;
}


function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run(`
            CREATE TABLE IF NOT EXISTS SOCSensor (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                run_id INTEGER NOT NULL,
                time_diff INTEGER NOT NULL,
                adcReading0 INTEGER NOT NULL,
                adcReading1 INTEGER NOT NULL,
                adcReading2 INTEGER NOT NULL,
                adcReading3 INTEGER NOT NULL,
                adcReading4 INTEGER NOT NULL,
                adcReading5 INTEGER NOT NULL,
                adcReading6 INTEGER NOT NULL,
                adcReading7 INTEGER NOT NULL
        )`, (err) => {
                if (err) {
                    console.error('Error creating SOCSensor table:', err.message);
                    reject(err);
                    return;
                }
                tables_initialized.SOCSensor = true;
            });

            db.run(`
            CREATE TABLE IF NOT EXISTS MainBatteryState (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                run_id INTEGER NOT NULL,
                state_vector BLOB NOT NULL,
                covariance_matrix BLOB NOT NULL,
                process_noise BLOB NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('Error creating MainBatteryState table:', err.message);
                    reject(err);
                } else {
                    tables_initialized.MainBatteryState = true;
                }
            });

            db.run(`
            CREATE TABLE IF NOT EXISTS AlternateBatteryState (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                run_id INTEGER NOT NULL,
                state_vector BLOB NOT NULL,
                covariance_matrix BLOB NOT NULL,
                process_noise BLOB NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('Error creating AlternateBatteryState table:', err.message);
                    reject(err);
                } else {
                    tables_initialized.AlternateBatteryState = true;
                }
            });

            db.run(`
            CREATE TABLE IF NOT EXISTS MainRCMapping (
                SoC REAL PRIMARY KEY,
                R0 REAL NOT NULL,
                R1 REAL NOT NULL,
                R2 REAL NOT NULL,
                C1 REAL NOT NULL,
                C2 REAL NOT NULL,
                Tau1 REAL NOT NULL,
                Tau2 REAL NOT NULL,
                OCV REAL NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('Error creating MainRCMapping table:', err.message);
                    reject(err);
                } else {
                    tables_initialized.MainRCMapping = true;
                }
            });

            db.run(`
            CREATE TABLE IF NOT EXISTS AlternateRCMapping (
                SoC REAL PRIMARY KEY,
                R0 REAL NOT NULL,
                R1 REAL NOT NULL,
                R2 REAL NOT NULL,
                C1 REAL NOT NULL,
                C2 REAL NOT NULL,
                Tau1 REAL NOT NULL,
                Tau2 REAL NOT NULL,
                OCV REAL NOT NULL
            )`, (err) => {
                if (err) {
                    console.error('Error creating AlternateRCMapping table:', err.message);
                    reject(err);
                } else {
                    tables_initialized.AlternateRCMapping = true;
                }
            });
        });
    })
};

function insertBulkBatteryState(batch, tableName = 'MainRCMapping') {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flatValues = batch.flat();
    const sql = `INSERT INTO ${tableName} (SoC, R0, R1, R2, C1, C2, Tau1, Tau2, OCV) VALUES ${placeholders}
        ON CONFLICT(SoC)
        DO UPDATE SET
            R0 = excluded.R0,
            R1 = excluded.R1,
            R2 = excluded.R2,
            C1 = excluded.C1,
            C2 = excluded.C2,
            Tau1 = excluded.Tau1,
            Tau2 = excluded.Tau2,
            OCV = excluded.OCV;`;
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        db.run(sql, flatValues, function (err) {
            if (err) {
                console.error('Error inserting battery state batch:', err.message);
            } else {
                //console.log(`Inserted batch of ${batch.length} battery state into ${tableName}.`);
            }
        });
        db.run('COMMIT');
    });
    return batch.length;
}

async function getRCTableLength(tableName = 'MainRCMapping') {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) AS count FROM ${tableName}`, (err, row) => {
            if (err) {
                console.error(`Error counting rows in ${tableName}:`, err.message);
                reject(err);
            } else {
                resolve(row.count);
            }
        });
    });
}

async function insertBatteryState(battery_type = 'LiNMC', tableName = 'MainRCMapping', override = false) {
    const rc_path = "./model/battery_model/" + battery_type + "/battery_state.csv";
    let batch = [];
    const batch_size = 2000;
    let inserted = 0;

    const tableLength = await getRCTableLength(tableName);
    if (tableLength > 0 && !override) {
        console.log(`${tableName} already has ${tableLength} records. Skipping insertion.`);
        return;
    }

    return new Promise((resolve, reject) => {
        fs.createReadStream(rc_path)
            .pipe(csv())
            .on('data', (row) => {
                const { SoC, R0, R1, R2, C1, C2, Tau1, Tau2, OCV } = row;
                batch.push([
                    parseFloat(SoC),
                    parseFloat(R0),
                    parseFloat(R1),
                    parseFloat(R2),
                    parseFloat(C1),
                    parseFloat(C2),
                parseFloat(Tau1),
                parseFloat(Tau2),
                parseFloat(OCV)
            ]);
            if (batch.length >= batch_size) {
                inserted += insertBulkBatteryState(batch, tableName);
                batch = [];
            }
        })
        .on('end', () => {
            if (batch.length > 0) {
                inserted += insertBulkBatteryState(batch, tableName);
            }
            console.log(`Total inserted records: ${inserted} into ${tableName}`);
            resolve(inserted);
        })
        .on('error', (err) => {
            console.error('Error reading CSV file:', err.message);
            reject(err);
        });
    });
}


module.exports = {
    getDB,
    startDB,
    initializeDatabase,
    insertBatteryState
};