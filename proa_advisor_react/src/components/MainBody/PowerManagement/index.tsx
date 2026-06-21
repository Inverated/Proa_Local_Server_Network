import { useEffect, useState } from "react";
import DynamicLineChart from "../../Chart/DynamicLineChart";
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
    total_load_W: number;
    total_mppt_W: number;
    total_batt1_net_W: number;
    total_batt2_net_W: number;
    I_batt_main: number;
    I_batt_alternate: number;
    I_mppt: number;
    I_load: number;
    Corrected_I_batt_main: number;
    Corrected_I_batt_alternate: number;
    Corrected_I_mppt: number;
    Corrected_I_load: number;
    V_batt_main: number;
    V_batt_alternate: number;
    Corrected_V_batt_main: number;
    Corrected_V_batt_alternate?: number;
    OCV_batt_main: number;
    OCV_batt_alternate?: number;
    SoC_batt_main: number;
    SoC_batt_alternate?: number;
};

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
            if (data.V_batt_main !== undefined) {
                setVoltageReadingMain((prev) => [...prev, data.V_batt_main as number].slice(-ARRAY_LENGTH));
            }
            if (data.Corrected_V_batt_main !== undefined) {
                setCorrectedVoltageMain((prev) => [...prev, data.Corrected_V_batt_main as number].slice(-ARRAY_LENGTH));
            }
            if (data.OCV_batt_main !== undefined) {
                setOCVMain((prev) => [...prev, data.OCV_batt_main as number].slice(-ARRAY_LENGTH));
            }
            if (data.SoC_batt_main !== undefined) {
                setSocMain((prev) => [...prev, data.SoC_batt_main as number].slice(-ARRAY_LENGTH));
            }
            if (data.V_batt_alternate !== undefined) {
                setVoltageReadingAlt((prev) => [...prev, data.V_batt_alternate as number].slice(-ARRAY_LENGTH));
            }
            if (data.Corrected_V_batt_alternate !== undefined) {
                setCorrectedVoltageAlt((prev) => [...prev, data.Corrected_V_batt_alternate as number].slice(-ARRAY_LENGTH));
            }
            if (data.OCV_batt_alternate !== undefined) {
                setOCVAlt((prev) => [...prev, data.OCV_batt_alternate as number].slice(-ARRAY_LENGTH));
            }
            if (data.SoC_batt_alternate !== undefined) {
                setSocAlt((prev) => [...prev, data.SoC_batt_alternate as number].slice(-ARRAY_LENGTH));
            }
            if (data.I_load !== undefined) {
                setCurrentLoad((prev) => [...prev, data.I_load as number].slice(-ARRAY_LENGTH));
            }
            if (data.I_mppt !== undefined) {
                setCurrentMPPT((prev) => [...prev, data.I_mppt as number].slice(-ARRAY_LENGTH));
            }
            if (data.I_batt_main !== undefined) {
                setCurrentNetMain((prev) => [...prev, data.I_batt_main as number].slice(-ARRAY_LENGTH));
            }
            if (data.I_batt_alternate !== undefined) {
                setCurrentNetAlt((prev) => [...prev, data.I_batt_alternate as number].slice(-ARRAY_LENGTH));
            }
            if (data.Corrected_I_load !== undefined) {
                setCorrectedCurrentLoad((prev) => [...prev, data.Corrected_I_load as number].slice(-ARRAY_LENGTH));
            }
            if (data.Corrected_I_mppt !== undefined) {
                setCorrectedCurrentMPPT((prev) => [...prev, data.Corrected_I_mppt as number].slice(-ARRAY_LENGTH));
            }
            if (data.Corrected_I_batt_main !== undefined) {
                setCorrectedCurrentNetMain((prev) => [...prev, data.Corrected_I_batt_main as number].slice(-ARRAY_LENGTH));
            }
            if (data.Corrected_I_batt_alternate !== undefined) {
                setCorrectedCurrentNetAlt((prev) => [...prev, data.Corrected_I_batt_alternate as number].slice(-ARRAY_LENGTH));
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