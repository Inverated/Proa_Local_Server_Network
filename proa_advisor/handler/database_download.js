const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const STREAM_BATCH_SIZE = 500;
const INTER_BATCH_DELAY_MS = 2;
const DB_PATH = path.resolve(__dirname, "..", "proa.db");
let activeDownload = null;

class DownloadInProgressError extends Error {
    constructor(message = "Another SOCSensor download is already in progress.") {
        super(message);
        this.name = "DownloadInProgressError";
        this.statusCode = 409;
    }
}

function acquireDownloadLock() {
    if (activeDownload !== null) {
        throw new DownloadInProgressError();
    }
    const token = Symbol("socsensor-download-lock");
    activeDownload = { token, startedAt: Date.now() };
    return token;
}

function releaseDownloadLock(token) {
    if (activeDownload?.token === token) {
        activeDownload = null;
    }
}

function waitForDrain(stream) {
    return new Promise((resolve, reject) => {
        const onDrain = () => {
            cleanup();
            resolve();
        };
        const onClose = () => {
            cleanup();
            resolve();
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            stream.off("drain", onDrain);
            stream.off("close", onClose);
            stream.off("error", onError);
        };

        stream.on("drain", onDrain);
        stream.on("close", onClose);
        stream.on("error", onError);
    });
}

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }
    const asString = String(value);
    if (asString.includes(",") || asString.includes('"') || asString.includes("\n") || asString.includes("\r")) {
        return `"${asString.replace(/"/g, '""')}"`;
    }
    return asString;
}

function openReadOnlyDB() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READONLY, (err) => {
            if (err) {
                reject(err);
            } else {
                db.configure("busyTimeout", 2000);
                resolve(db);
            }
        });
    });
}

function closeDB(db) {
    return new Promise((resolve) => {
        if (!db) {
            resolve();
            return;
        }
        db.close(() => resolve());
    });
}

function fetchRowsBatch(db, runId, startRowId, lastId, batchSize) {
    return new Promise((resolve, reject) => {
        db.all(
            `
                SELECT id, timestamp, run_id, time_diff, adcReading0, adcReading1, adcReading2, adcReading3, adcReading4, adcReading5, adcReading6, adcReading7
                FROM SOCSensor
                WHERE run_id = ? AND id >= ? AND id > ?
                ORDER BY id ASC
                LIMIT ?
            `,
            [runId, startRowId, lastId, batchSize],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            },
        );
    });
}

function writeCsvRow(res, values) {
    const line = `${values.map(escapeCsvValue).join(",")}\n`;
    return res.write(line);
}

function normalizeRowId(value) {
    if (value === undefined || value === null || value === "") {
        return 0;
    }
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("rowid must be a non-negative integer.");
    }
    return parsed;
}

function normalizeRunId(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error("run_id must be a positive integer.");
    }
    return parsed;
}

async function getSOCSensorRunSummaries() {
    const db = await openReadOnlyDB();
    try {
        const rows = await new Promise((resolve, reject) => {
            db.all(
                `
                    SELECT run_id, MIN(id) AS start_row_id, MIN(timestamp) AS start_datetime, COUNT(*) AS row_count
                    FROM SOCSensor
                    GROUP BY run_id
                    ORDER BY run_id DESC
                `,
                [],
                (err, summaryRows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(summaryRows ?? []);
                    }
                },
            );
        });
        return rows.map((row) => ({
            run_id: row.run_id,
            start_row_id: row.start_row_id,
            start_datetime: row.start_datetime,
            row_count: row.row_count,
        }));
    } finally {
        await closeDB(db);
    }
}

async function streamSOCSensorCsvByRun(req, res, runId, startRowId = 0) {
    const lockToken = acquireDownloadLock();
    let readOnlyDB = null;
    let reqClosed = false;
    const onClose = () => {
        reqClosed = true;
    };
    req.on("close", onClose);

    const fileName = `SOCSensor_run_${runId}_from_rowid_${startRowId}.csv`;
    const headers = [
        "id",
        "timestamp",
        "run_id",
        "time_diff",
        "adcReading0",
        "adcReading1",
        "adcReading2",
        "adcReading3",
        "adcReading4",
        "adcReading5",
        "adcReading6",
        "adcReading7",
    ];

    try {
        readOnlyDB = await openReadOnlyDB();

        let lastId = startRowId - 1;
        let rows = await fetchRowsBatch(readOnlyDB, runId, startRowId, lastId, STREAM_BATCH_SIZE);
        if (rows.length === 0) {
            res.status(404).json({
                message: `No SOCSensor rows found for run_id=${runId} from rowid=${startRowId}.`,
            });
            return;
        }

        res.status(200);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Run-Id", String(runId));
        res.flushHeaders?.();

        if (!writeCsvRow(res, headers)) {
            await waitForDrain(res);
        }

        while (!reqClosed && !res.writableEnded) {
            for (const row of rows) {
                if (reqClosed || res.writableEnded) {
                    break;
                }

                const canContinue = writeCsvRow(res, [
                    row.id,
                    row.timestamp,
                    row.run_id,
                    row.time_diff,
                    row.adcReading0,
                    row.adcReading1,
                    row.adcReading2,
                    row.adcReading3,
                    row.adcReading4,
                    row.adcReading5,
                    row.adcReading6,
                    row.adcReading7,
                ]);
                if (!canContinue) {
                    await waitForDrain(res);
                }
            }

            lastId = rows[rows.length - 1].id;
            if (rows.length < STREAM_BATCH_SIZE) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, INTER_BATCH_DELAY_MS));
            rows = await fetchRowsBatch(readOnlyDB, runId, startRowId, lastId, STREAM_BATCH_SIZE);
            if (rows.length === 0) {
                break;
            }
        }

        if (!res.writableEnded) {
            res.end();
        }
    } finally {
        req.off("close", onClose);
        releaseDownloadLock(lockToken);
        await closeDB(readOnlyDB);
    }
}

module.exports = {
    DownloadInProgressError,
    getSOCSensorRunSummaries,
    normalizeRowId,
    normalizeRunId,
    streamSOCSensorCsvByRun,
};
