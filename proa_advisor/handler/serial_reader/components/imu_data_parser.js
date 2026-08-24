/*
Packet layout (28 bytes total):

struct __attribute__((packed)) PacketTemplate {
  uint32_t header;          // offset 0,  4 bytes  ("MAST" as LE uint32)
  uint16_t counter;         // offset 4,  2 bytes
  PayloadT payload;         // offset 6,  17 bytes (Telemetry_Payload)
  uint8_t padding[3];       // offset 23, 3 bytes
  uint16_t chksum;          // offset 26, 2 bytes
};

struct __attribute__((packed)) Telemetry_Payload {
  int16_t  baseRoll;           // offset 6,  2 bytes  (fixed-point x100)
  int16_t  basePitch;          // offset 8,  2 bytes
  int16_t  topRoll;            // offset 10, 2 bytes
  int16_t  topPitch;           // offset 12, 2 bytes
  int16_t  topMinusBaseRoll;   // offset 14, 2 bytes
  int16_t  topMinusBasePitch;  // offset 16, 2 bytes
  int16_t  vectorAngle;        // offset 18, 2 bytes
  uint16_t topSeq;             // offset 20, 2 bytes
  uint8_t  status;             // offset 22, 1 byte  (bit0=topConnected, bit1=sensingEnabled, bit2=zeroReady)
};                             // = 17 bytes

Checksum scope: bytes 4..25 (counter + payload + padding), excludes header and chksum fields.
*/

const { write_to_clients } = require('../../client_transmission');
const { insertIMUDataBulk, getLatestIMURunId } = require('../../../model/imu_db');

const ANGLE_SCALE = 100.0;
const BULK_INSERT_SIZE = 50; // Flush to DB every 50 samples (~5 seconds at 10Hz)

// Backstop for the size threshold so samples are never held longer than this,
// which also keeps the run_id gap heuristic reading a fresh newest-row timestamp.
const FLUSH_INTERVAL_MS = 2000;

const MAX_QUEUE = 5000;

const imuQueue = [];
let imuRunId = null;
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
async function getCurrentIMURunId() {
    if (imuRunId !== null) return imuRunId;
    if (!runIdPromise) {
        runIdPromise = getLatestIMURunId()
            .then(({ run_id, is_new }) => {
                imuRunId = run_id;
                console.log(`[IMU] Current run_id: ${run_id}, is_new: ${is_new}`);
                return run_id;
            })
            .catch((err) => {
                console.error('[IMU] Failed to resolve run_id, defaulting to 1:', err.message);
                imuRunId = 1;
                return 1;
            });
    }
    return runIdPromise;
}

/**
 * Start the periodic flush once data actually starts arriving.
 *
 * The timer only kicks a flush off, it is never awaited by the serial path, and
 * consumeIMUQueue is a no-op when a flush is already running or the queue is
 * empty. unref() keeps it from holding the process open.
 */
function ensureFlushTimer() {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
        consumeIMUQueue(true);
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

function parseIMUData(recvBuf, packet_bytes, packetSkipped = 0) {
    // Read fields
    const counter = recvBuf.readUInt16LE(4);
    const baseRollRaw = recvBuf.readInt16LE(6);
    const basePitchRaw = recvBuf.readInt16LE(8);
    const topRollRaw = recvBuf.readInt16LE(10);
    const topPitchRaw = recvBuf.readInt16LE(12);
    const topMinusBaseRollRaw = recvBuf.readInt16LE(14);
    const topMinusBasePitchRaw = recvBuf.readInt16LE(16);
    const vectorAngleRaw = recvBuf.readInt16LE(18);
    const topSeq = recvBuf.readUInt16LE(20);
    const status = recvBuf.readUInt8(22);
    const chksum = recvBuf.readUInt16LE(26);

    // Checksum validation: covers bytes 4..25 (counter + payload + padding)
    const checksumCalBuffer = recvBuf.subarray(4, 26);
    if (chksum !== checksum16Bytes(checksumCalBuffer)) {
        console.warn(`[IMU] Checksum fail at counter ${counter}. Re-syncing.`);
        return null;
    }

    // Convert fixed-point to float (divide by 100)
    const baseRoll = baseRollRaw / ANGLE_SCALE;
    const basePitch = basePitchRaw / ANGLE_SCALE;
    const topRoll = topRollRaw / ANGLE_SCALE;
    const topPitch = topPitchRaw / ANGLE_SCALE;
    const topMinusBaseRoll = topMinusBaseRollRaw / ANGLE_SCALE;
    const topMinusBasePitch = topMinusBasePitchRaw / ANGLE_SCALE;
    const vectorAngle = vectorAngleRaw / ANGLE_SCALE;

    // Compute derived fields (server-side)
    const bendMagnitude = Math.sqrt(topMinusBaseRoll * topMinusBaseRoll + topMinusBasePitch * topMinusBasePitch);
    const baseMinusTopRoll = -topMinusBaseRoll;
    const baseMinusTopPitch = -topMinusBasePitch;

    // Unpack status bitfield
    const topConnected = !!(status & 0x01);
    const sensingEnabled = !!(status & 0x02);
    const zeroReady = !!(status & 0x04);

    const telemetry = {
        counter,
        baseRoll,
        basePitch,
        topRoll,
        topPitch,
        topMinusBaseRoll,
        topMinusBasePitch,
        vectorAngle,
        bendMagnitude,
        baseMinusTopRoll,
        baseMinusTopPitch,
        topSeq,
        topConnected,
        sensingEnabled,
        zeroReady
    };

    // Send to all connected frontend clients via SSE
    write_to_clients("imu", telemetry);

    // Queue for bulk DB insert. recv_ms is the host receive time, stored so the
    // chart x-axis can be rebuilt on recovery instead of assuming a fixed rate.
    imuQueue.push({ ...telemetry, recv_ms: Date.now() });
    ensureFlushTimer();

    return recvBuf.subarray(packet_bytes);
}

/**
 * Flush the IMU queue to the database in bulk.
 *
 * Called (never awaited) from processBuffer in serialReader.js and from the
 * periodic timer. Returns immediately when a flush is already in flight, so the
 * serial reader never waits on the disk and a slow write cannot back up.
 *
 * @param {boolean} force Ignore the batch size threshold (timer / shutdown path)
 */
async function consumeIMUQueue(force = false) {
    if (consuming || imuQueue.length === 0) return;
    if (!force && imuQueue.length < BULK_INSERT_SIZE) return; // Wait until we have enough

    consuming = true;
    const batch = imuQueue.splice(0, imuQueue.length);

    try {
        const runId = await getCurrentIMURunId();
        await insertIMUDataBulk(batch.map(d => ({ ...d, run_id: runId })));
    } catch (err) {
        console.error('[IMU] Bulk insert error:', err.message);
        // Requeue so a transient failure retries on the next flush, but drop the
        // batch once the backlog is past the cap rather than growing forever.
        if (imuQueue.length + batch.length <= MAX_QUEUE) {
            imuQueue.unshift(...batch);
        } else {
            console.error(`[IMU] Backlog over ${MAX_QUEUE}, dropping ${batch.length} rows.`);
        }
    } finally {
        consuming = false;
    }
}

/**
 * Force flush remaining items (e.g., on shutdown or disconnect).
 */
async function flushIMUQueue() {
    return consumeIMUQueue(true);
}

module.exports = {
    parseIMUData,
    consumeIMUQueue,
    flushIMUQueue,
    getCurrentIMURunId
};
