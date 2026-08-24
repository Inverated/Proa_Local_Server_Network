type StrainData = {
    counter: number;
    adjustedReading: number;
};

// Row shape returned by /initial_strain_data (StrainReadings table).
type StrainReading = {
    id: number;
    run_id: number;
    counter: number;
    adjustedReading: number;
    recv_ms: number | null;
    timestamp: string;
};
