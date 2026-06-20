import { useEffect, useState } from "react";
import DynamicLineChart from "./DynamicLineChart";
import Grid from '@mui/material/Grid';

/* Charts:
1. Voltage Main (actual vs corrected)
2. Voltage Alt (actual vs corrected)
3. SOC Main and Alt
4. Current Load, MPPT, Net Main, Net Alt (actual vs corrected)
*/

const ARRAY_LENGTH = 1000;

type PowerData = {
    timestamp: number;
    total_load_W?: number;
    total_mppt_W?: number;
    total_batt1_net_W?: number;
    total_batt2_net_W?: number;
    voltageReadingMain?: number;
    correctedVoltageMain?: number;
    OCVMain?: number;
    socMain?: number;
    voltageReadingAlt?: number;
    correctedVoltageAlt?: number;
    OCVAlt?: number;
    socAlt?: number;
    currentMPPT?: number;
    currentLoad?: number;
    currentNetMain?: number;
    currentNetAlt?: number;
    correctedCurrentMPPT?: number;
    correctedCurrentLoad?: number;
    correctedCurrentNetMain?: number;
    correctedCurrentNetAlt?: number;
}

export default function PowerManagement() {
    const [xData, setXData] = useState<number[]>([]);

    const [voltageReadingMain, setVoltageReadingMain] = useState<number[]>([]);
    const [voltageReadingAlt, setVoltageReadingAlt] = useState<number[]>([]);
    const [OCVMain, setOCVMain] = useState<number[]>([]);
    const [correctedVoltageMain, setCorrectedVoltageMain] = useState<number[]>([]);
    const [correctedVoltageAlt, setCorrectedVoltageAlt] = useState<number[]>([]);
    const [OCVAlt, setOCVAlt] = useState<number[]>([]);

    const [socMain, setSocMain] = useState<number[]>([]);
    const [socAlt, setSocAlt] = useState<number[]>([]);

    const [currentLoad, setCurrentLoad] = useState<number[]>([]);
    const [currentMPPT, setCurrentMPPT] = useState<number[]>([]);
    const [currentNetMain, setCurrentNetMain] = useState<number[]>([]);
    const [currentNetAlt, setCurrentNetAlt] = useState<number[]>([]);
    const [correctedCurrentLoad, setCorrectedCurrentLoad] = useState<number[]>([]);
    const [correctedCurrentMPPT, setCorrectedCurrentMPPT] = useState<number[]>([]);
    const [correctedCurrentNetMain, setCorrectedCurrentNetMain] = useState<number[]>([]);
    const [correctedCurrentNetAlt, setCorrectedCurrentNetAlt] = useState<number[]>([]);

    useEffect(() => {
        // If xData is empty, fetch initial data to pupulate
        // ......


        // Set up EventSource to listen for incoming data
        const eventSource = new EventSource("http://localhost:4000/data_stream");
        eventSource.onmessage = (event) => {
            const data: PowerData = JSON.parse(event.data);
            console.log("Received data:", data);
            setXData((prevXData) => [...prevXData, data.timestamp].slice(-ARRAY_LENGTH));
            if (data.voltageReadingMain !== undefined) {
                setVoltageReadingMain((prev) => [...prev, data.voltageReadingMain as number].slice(-ARRAY_LENGTH));
            }
            if (data.correctedVoltageMain !== undefined) {
                setCorrectedVoltageMain((prev) => [...prev, data.correctedVoltageMain as number].slice(-ARRAY_LENGTH));
            }
            if (data.OCVMain !== undefined) {
                setOCVMain((prev) => [...prev, data.OCVMain as number].slice(-ARRAY_LENGTH));
            }
            if (data.socMain !== undefined) {
                setSocMain((prev) => [...prev, data.socMain as number].slice(-ARRAY_LENGTH));
            }
            if (data.voltageReadingAlt !== undefined) {
                setVoltageReadingAlt((prev) => [...prev, data.voltageReadingAlt as number].slice(-ARRAY_LENGTH));
            }
            if (data.correctedVoltageAlt !== undefined) {
                setCorrectedVoltageAlt((prev) => [...prev, data.correctedVoltageAlt as number].slice(-ARRAY_LENGTH));
            }
            if (data.OCVAlt !== undefined) {
                setOCVAlt((prev) => [...prev, data.OCVAlt as number].slice(-ARRAY_LENGTH));
            }
            if (data.socAlt !== undefined) {
                setSocAlt((prev) => [...prev, data.socAlt as number].slice(-ARRAY_LENGTH));
            }
            if (data.currentLoad !== undefined) {
                setCurrentLoad((prev) => [...prev, data.currentLoad as number].slice(-ARRAY_LENGTH));
            }
            if (data.currentMPPT !== undefined) {
                setCurrentMPPT((prev) => [...prev, data.currentMPPT as number].slice(-ARRAY_LENGTH));
            }
            if (data.currentNetMain !== undefined) {
                setCurrentNetMain((prev) => [...prev, data.currentNetMain as number].slice(-ARRAY_LENGTH));
            }
            if (data.currentNetAlt !== undefined) {
                setCurrentNetAlt((prev) => [...prev, data.currentNetAlt as number].slice(-ARRAY_LENGTH));
            }
            if (data.correctedCurrentLoad !== undefined) {
                setCorrectedCurrentLoad((prev) => [...prev, data.correctedCurrentLoad as number].slice(-ARRAY_LENGTH));
            }
            if (data.correctedCurrentMPPT !== undefined) {
                setCorrectedCurrentMPPT((prev) => [...prev, data.correctedCurrentMPPT as number].slice(-ARRAY_LENGTH));
            }
            if (data.correctedCurrentNetMain !== undefined) {
                setCorrectedCurrentNetMain((prev) => [...prev, data.correctedCurrentNetMain as number].slice(-ARRAY_LENGTH));
            }
            if (data.correctedCurrentNetAlt !== undefined) {
                setCorrectedCurrentNetAlt((prev) => [...prev, data.correctedCurrentNetAlt as number].slice(-ARRAY_LENGTH));
            }
        };

        return () => {
            eventSource.close();
        }
    }, []);


    return (
        <div className="power-management">
            <h2>Power Management</h2>
            <p>Manage your power settings and monitor energy consumption.</p>

            <Grid container spacing={2} columns={12}>

                <Grid size={{ xs: 12, lg: 6 }}>
                    <DynamicLineChart
                        title="Main Battery Voltage"
                        lineNames={['Actual', 'Corrected', 'OCV']}
                        xAxis={
                            { xData: xData }
                        }
                        yAxis={
                            {
                                yData: [voltageReadingMain, correctedVoltageMain, OCVMain],
                                yTitle: "Voltage",
                                yUnit: "V"
                            }
                        }
                    />
                </Grid>

                {voltageReadingAlt[0] !== undefined && (
                    <Grid size={{ xs: 12, lg: 6 }}>
                        <DynamicLineChart
                            title="Alt Battery Voltage"
                            lineNames={['Actual', 'Corrected', 'OCV']}
                            xAxis={
                                { xData: xData }
                            }
                            yAxis={
                                {
                                    yData: [voltageReadingAlt, correctedVoltageAlt, OCVAlt],
                                    yTitle: "Voltage",
                                    yUnit: "V"
                                }
                            }
                        />
                    </Grid>
                )}

                <Grid size={{ xs: 12, lg: 6 }}>
                    <DynamicLineChart
                        title="Main Battery SOC"
                        lineNames={['SOC']}
                        xAxis={
                            { xData: xData }
                        }
                        yAxis={
                            {
                                yData: [socMain],
                                yTitle: "State of Charge",
                                yUnit: "%",
                                yFixed: false,
                                significantDigits: 2
                            }
                        }
                    />
                </Grid>

                {voltageReadingAlt[0] !== undefined && (
                    <Grid size={{ xs: 12, lg: 6 }}>
                        <DynamicLineChart
                            title="Alt Battery SOC"
                            lineNames={['SOC']}
                            xAxis={
                                { xData: xData }
                            }
                            yAxis={
                                {
                                    yData: [socAlt],
                                    yTitle: "State of Charge",
                                    yUnit: "%",
                                    yFixed: false,
                                    significantDigits: 2
                                }
                            }
                        />
                    </Grid>
                )}

                <Grid size={{ xs: 12, lg: 6 }}>
                    <DynamicLineChart
                        title="Current Load"
                        lineNames={['Actual', 'Corrected']}
                        xAxis={
                            { xData: xData }
                        }
                        yAxis={
                            {
                                yData: [currentLoad, correctedCurrentLoad],
                                yTitle: "Current",
                                yUnit: "A"
                            }
                        }
                    />
                </Grid>

                <Grid size={{ xs: 12, lg: 6 }}>
                    <DynamicLineChart
                        title="Current MPPT"
                        lineNames={['Actual', 'Corrected']}
                        xAxis={
                            { xData: xData }
                        }
                        yAxis={
                            {
                                yData: [currentMPPT, correctedCurrentMPPT],
                                yTitle: "Current",
                                yUnit: "A"
                            }
                        }
                    />
                </Grid>

                <Grid size={{ xs: 12, lg: 6 }}>
                    <DynamicLineChart
                        title="Current Net Main"
                        lineNames={['Actual', 'Corrected']}
                        xAxis={
                            { xData: xData }
                        }
                        yAxis={
                            {
                                yData: [currentNetMain, correctedCurrentNetMain],
                                yTitle: "Current",
                                yUnit: "A"
                            }
                        }
                    />
                </Grid>

                {voltageReadingAlt[0] !== undefined && (
                    <Grid size={{ xs: 12, lg: 6 }}>
                        <DynamicLineChart
                            title="Current Net Alt"
                            lineNames={['Actual', 'Corrected']}
                            xAxis={
                                { xData: xData }
                            }
                            yAxis={
                                {
                                    yData: [currentNetAlt, correctedCurrentNetAlt],
                                    yTitle: "Current",
                                    yUnit: "A"
                                }
                            }
                        />
                    </Grid>
                )}
            </Grid>
        </div>
    );
}