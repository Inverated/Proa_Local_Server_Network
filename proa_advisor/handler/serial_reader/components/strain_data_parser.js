const { write_to_clients } = require('../../client_transmission');
const { insertStrainDataBulk, getLatestStrainRunId } = require('../../../model/strain_db');

const BULK_INSERT_SIZE = 100;
const FLUSH_INTERVAL_MS = 2000;

const MAX_QUEUE = 5000;

const strainQueue = [];
let strainRunId = null;
let runIdPromise = null;
let consuming = false;
let flushTimer = null;

/**
 * Resolve the run_id for this session once and share it.
 *
 * Mirrors the power path: kalman_filter.js caches current_run_id and
 * getCurrentRunId() hands that same value to /initial_power_data, so the writer
 * and the recovery endpoint can never disagree. Re-deriving it per request (the
 * previous behaviour) let the 5-minute gap heuristic hand the endpoint a
 * run_id + 1 that has no rows, which returned an empty chart.
 *
 * The in-flight promise is shared so concurrent callers cannot each allocate.
 */
async function getCurrentStrainRunId() {
    if (strainRunId !== null) return strainRunId;
    if (!runIdPromise) {
        runIdPromise = getLatestStrainRunId()
            .then(({ run_id, is_new }) => {
                strainRunId = run_id;
                console.log(`[STRAIN] Current run_id: ${run_id}, is_new: ${is_new}`);
                return run_id;
            })
            .catch((err) => {
                console.error('[STRAIN] Failed to resolve run_id, defaulting to 1:', err.message);
                strainRunId = 1;
                return 1;
            });
    }
    return runIdPromise;
}

/**
 * Start the periodic flush once data actually starts arriving.
 *
 * The timer only kicks a flush off, it is never awaited by the serial path, and
 * consumeStrainQueue is a no-op when a flush is already running or the queue is
 * empty. unref() keeps it from holding the process open.
 */
function ensureFlushTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
        consumeStrainQueue(true);
    }, FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
}

function checksum16Bytes(buf) {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
        sum = ((sum << 1) ^ buf[i] ^ (sum >>> 15)) & 0xFFFF;
    }
    return sum;
}

function parseStrainData(recvBuf, packet_bytes, packetSkipped = 0) {
    const counter = recvBuf.readUInt16LE(4);
    const adjustedReading = recvBuf.readInt32LE(6);
    const chksum = recvBuf.readUInt16LE(26);

    // Checksum validation: covers bytes 0..25 (everything except chksum)
    const checksumBuf = recvBuf.subarray(0, 26);
    if (chksum !== checksum16Bytes(checksumBuf)) {
        console.warn(`[STRAIN] Checksum fail at counter ${counter}. Re-syncing.`);
        return null;
    }

    const telemetry = {
        counter,
        adjustedReading
    };

    //console.log(`[STRAIN] Counter: ${counter}, Adjusted Reading: ${adjustedReading}, Skipped Packets: ${packetSkipped}`);
    write_to_clients("strain", telemetry);

    // Queue for bulk DB insert. recv_ms is the host receive time, stored so the
    // chart x-axis can be rebuilt on recovery instead of assuming a fixed rate.
    strainQueue.push({ ...telemetry, recv_ms: Date.now() });
    ensureFlushTimer();

    return recvBuf.subarray(packet_bytes);
}

/**
 * Flush the strain queue to the database in bulk.
 *
 * Called (never awaited) from processBuffer in serialReader.js and from the
 * periodic timer. Returns immediately when a flush is already in flight, so the
 * serial reader never waits on the disk and a slow write cannot back up.
 *
 * @param {boolean} force Ignore the batch size threshold (timer / shutdown path)
 */
async function consumeStrainQueue(force = false) {
    if (consuming || strainQueue.length === 0) return;
    if (!force && strainQueue.length < BULK_INSERT_SIZE) return; // Wait until we have enough

    consuming = true;
    const batch = strainQueue.splice(0, strainQueue.length);

    try {
        const runId = await getCurrentStrainRunId();
        await insertStrainDataBulk(batch.map(d => ({ ...d, run_id: runId })));
    } catch (err) {
        console.error('[STRAIN] Bulk insert error:', err.message);
        // Requeue so a transient failure retries on the next flush, but drop the
        // batch once the backlog is past the cap rather than growing forever.
        if (strainQueue.length + batch.length <= MAX_QUEUE) {
            strainQueue.unshift(...batch);
        } else {
            console.error(`[STRAIN] Backlog over ${MAX_QUEUE}, dropping ${batch.length} rows.`);
        }
    } finally {
        consuming = false;
    }
}

/**
 * Force flush remaining items (e.g., on shutdown or disconnect).
 */
async function flushStrainQueue() {
    return consumeStrainQueue(true);
}

module.exports = {
    parseStrainData,
    consumeStrainQueue,
    flushStrainQueue,
    getCurrentStrainRunId
};
