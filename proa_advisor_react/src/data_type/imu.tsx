type IMUData = {
    counter: number;
    baseRoll: number;
    basePitch: number;
    topRoll: number;
    topPitch: number;
    topMinusBaseRoll: number;
    topMinusBasePitch: number;
    vectorAngle: number;
    bendMagnitude: number;
    baseMinusTopRoll: number;
    baseMinusTopPitch: number;
    topSeq: number;
    topConnected: boolean;
    sensingEnabled: boolean;
    zeroReady: boolean;
};

// Row shape returned by /initial_imu_data (IMUReadings table). Booleans are
// stored as 0/1 and baseMinusTop* are derived at stream time, so this differs
// from the live SSE payload.
type IMUReading = {
    id: number;
    run_id: number;
    counter: number;
    baseRoll: number;
    basePitch: number;
    topRoll: number;
    topPitch: number;
    topMinusBaseRoll: number;
    topMinusBasePitch: number;
    vectorAngle: number;
    bendMagnitude: number;
    topSeq: number;
    topConnected: number;
    sensingEnabled: number;
    zeroReady: number;
    recv_ms: number | null;
    timestamp: string;
};
