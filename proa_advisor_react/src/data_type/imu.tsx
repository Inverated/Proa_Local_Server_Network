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
