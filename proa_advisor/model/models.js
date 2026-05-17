const sqlite3 = require('sqlite3').verbose();

const DB_PATH = './proa.db';
const fs = require('fs');
const csv = require('csv-parser');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initializeDatabase();
    }
});

function initializeDatabase() {
    db.serialize(() => {
        db.run(`
            CREATE TABLE IF NOT EXISTS SOCSensor (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                timeSinceSensorStart INTEGER NOT NULL,
                adcReading1 INTEGER NOT NULL,
                adcReading2 INTEGER NOT NULL,
                adcReading3 INTEGER NOT NULL,
                adcReading4 INTEGER NOT NULL,
                adcReading5 INTEGER NOT NULL,
                current1 REAL NOT NULL,
                current2 REAL NOT NULL,
                current3 REAL NOT NULL,
                current4 REAL NOT NULL,
                voltage REAL NOT NULL
        )`, (err) => {
            if (err) {
                console.error('Error creating SOCSensor table:', err.message);
            }
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS SOCLastOffset (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                adc1Offset INTEGER NOT NULL,
                adc2Offset INTEGER NOT NULL,
                adc3Offset INTEGER NOT NULL,
                adc4Offset INTEGER NOT NULL,
                adc5Offset INTEGER NOT NULL
        )`, (err) => {
            if (err) {
                console.error('Error creating SOCLastOffset table:', err.message);
            }
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS BatteryState (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                soc REAL NOT NULL,
                v_rc1 REAL NOT NULL,
                v_rc2 REAL NOT NULL,
                err_cov BLOB NOT NULL
            )`, (err) => {
            if (err) {
                console.error('Error creating BatteryState table:', err.message);
            }
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS MainRCMapping (
                soc REAL PRIMARY KEY,
                r0 REAL NOT NULL,
                r1 REAL NOT NULL,
                r2 REAL NOT NULL,
                c1 REAL NOT NULL,
                c2 REAL NOT NULL,
                a1 REAL NOT NULL,
                a2 REAL NOT NULL,
                ocv REAL NOT NULL
            )`, (err) => {
            if (err) {
                console.error('Error creating MainRCMapping table:', err.message);
            } else {
                insertBatteryState();
            }
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS AlternateRCMapping (
                soc REAL PRIMARY KEY,
                r0 REAL NOT NULL,
                r1 REAL NOT NULL,
                r2 REAL NOT NULL,
                c1 REAL NOT NULL,
                c2 REAL NOT NULL,
                a1 REAL NOT NULL,
                a2 REAL NOT NULL,
                ocv REAL NOT NULL
            )`, (err) => {
            if (err) {
                console.error('Error creating AlternateRCMapping table:', err.message);
            } else {
            }
        })
    });
}

function insertBulkBatteryState(batch, tableName='MainRCMapping') {
    const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const flatValues = batch.flat();
    const sql = `INSERT INTO ${tableName} (soc, r0, r1, r2, c1, c2, a1, a2, ocv) VALUES ${placeholders}
        ON CONFLICT(soc)
        DO UPDATE SET
            r0 = excluded.r0,
            r1 = excluded.r1,
            r2 = excluded.r2,
            c1 = excluded.c1,
            c2 = excluded.c2,
            a1 = excluded.a1,
            a2 = excluded.a2,
            ocv = excluded.ocv;`;
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


function insertBatteryState() {
    main_rc_path = './model/battery_model/LiNMC/battery_state.csv';
    batch = [];
    batch_size = 2000;
    inserted = 0;
    fs.createReadStream(main_rc_path)
        .pipe(csv())
        .on('data', (row) => {
            const { SoC, R0, R1, R2, C1, C2, A1, A2, OCV } = row;
            batch.push([
                parseFloat(SoC),
                parseFloat(R0),
                parseFloat(R1),
                parseFloat(R2),
                parseFloat(C1),
                parseFloat(C2),
                parseFloat(A1),
                parseFloat(A2),
                parseFloat(OCV)
            ]);
            if (batch.length >= batch_size) {
                inserted += insertBulkBatteryState(batch, 'MainRCMapping');
                batch = [];
            }
        })
        .on('end', () => {
            console.log(`${main_rc_path} successfully processed`);
            if (batch.length > 0) {
                inserted += insertBulkBatteryState(batch, 'MainRCMapping');
            }
            console.log(`Total inserted records: ${inserted}`);
        });
}


module.exports = {
    db,
    initializeDatabase
};