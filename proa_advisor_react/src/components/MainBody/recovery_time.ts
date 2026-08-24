/**
 * Helpers for rebuilding a chart x-axis from rows recovered out of the local
 * database.
 *
 * Sensor tables store `recv_ms` (host receive time in epoch milliseconds) so the
 * spacing between recovered points reflects the node's real sample rate. Rows
 * written before `recv_ms` existed only carry the 1-second-resolution SQLite
 * `timestamp`, and a final index-based fallback keeps the chart usable if
 * neither field is present.
 */

export type TimedRow = {
    recv_ms?: number | null;
    timestamp?: string | null;
};

/**
 * Resolve a row's time in epoch milliseconds.
 *
 * @param row Recovered database row
 * @param index Position of the row in the result set
 * @param assumedIntervalMs Spacing used only when no time field is available
 */
export function resolveTimeMs(row: TimedRow, index: number, assumedIntervalMs = 100): number {
    if (typeof row?.recv_ms === "number" && Number.isFinite(row.recv_ms)) {
        return row.recv_ms;
    }

    if (row?.timestamp) {
        // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
        const parsed = Date.parse(row.timestamp.replace(" ", "T") + "Z");
        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }

    return index * assumedIntervalMs;
}
