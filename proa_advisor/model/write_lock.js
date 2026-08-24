/**
 * Serializes multi-statement transactions across all writers on the shared
 * sqlite3 connection.
 *
 * Every bulk writer (power ADC, power states, IMU, strain) wraps its work in
 * BEGIN ... COMMIT. sqlite3 gives the whole process one connection, so two
 * writers overlapping produce "cannot start a transaction within a transaction"
 * and lose a batch. The power path never hit this because all of its writes
 * funnel through onNewSample sequentially; the IMU and strain flush timers fire
 * on wall-clock intervals independent of that path, so they can interleave.
 *
 * This is a queue, not a busy-wait: callers await their turn, the event loop
 * stays free, and the serial reader never awaits any of this. Throughput is
 * unaffected because sqlite3 already executes statements one at a time on this
 * connection - the lock only stops the BEGIN/COMMIT pairs from interleaving.
 */

let tail = Promise.resolve();

/**
 * Run fn once every previously queued write has settled.
 *
 * @param {() => Promise<any>} fn Work to run while holding the lock
 * @returns {Promise<any>} fn's result, rejecting if fn rejects
 */
function withWriteLock(fn) {
    // Run fn regardless of whether the previous holder resolved or rejected.
    const result = tail.then(fn, fn);
    // Keep the chain alive and swallowed so one failure cannot poison the queue.
    tail = result.then(() => { }, () => { });
    return result;
}

module.exports = { withWriteLock };
