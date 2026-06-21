import { useEffect, useRef, useState } from "react";
import DynamicLineChart from "../../Chart/DynamicLineChart";
import Grid from '@mui/material/Grid';
import Slider from "@mui/material/Slider";
import Box from '@mui/material/Box';

/* Charts:
1. Voltage Main (actual vs corrected)
2. Voltage Alt (actual vs corrected)
3. SOC Main and Alt
4. Current Load, MPPT, Net Main, Net Alt (actual vs corrected)
*/

const ARRAY_LENGTH = 500;

type PowerData = {
    total_time: number;
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
    V_batt_alternate?: number;
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

    const [displayDataLength, setDisplayDataLength] = useState<number>(ARRAY_LENGTH);
    const lengthSliderRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let defaultLength = ARRAY_LENGTH;
        if (localStorage.getItem("displayDataLength")) {
            defaultLength = parseInt(localStorage.getItem("displayDataLength") || "");
            setDisplayDataLength(defaultLength);
        }

        // If xData is empty, fetch initial data to pupulate
        if (xData.length === 0) {
            const fetchInitialData = async () => {
                try {
                    const response = await fetch("http://localhost:4000/initial_data");
                    const initialData: PowerData[] = await response.json();
                    if (initialData && initialData.length > 0) {
                        initialData.forEach((data) => {
                            setXData((prevXData) => [...prevXData, data.total_time].slice(-defaultLength));
                            data.V_batt_main && setVoltageReadingMain((prev) => [...prev, data.V_batt_main as number].slice(-defaultLength));
                            data.Corrected_V_batt_main && setCorrectedVoltageMain((prev) => [...prev, data.Corrected_V_batt_main as number].slice(-defaultLength));
                            data.OCV_batt_main && setOCVMain((prev) => [...prev, data.OCV_batt_main as number].slice(-defaultLength));
                            data.SoC_batt_main && setSocMain((prev) => [...prev, data.SoC_batt_main as number].slice(-defaultLength));
                            data.V_batt_alternate && setVoltageReadingAlt((prev) => [...prev, data.V_batt_alternate as number].slice(-defaultLength));
                            data.Corrected_V_batt_alternate && setCorrectedVoltageAlt((prev) => [...prev, data.Corrected_V_batt_alternate as number].slice(-defaultLength));
                            data.OCV_batt_alternate && setOCVAlt((prev) => [...prev, data.OCV_batt_alternate as number].slice(-defaultLength));
                            data.SoC_batt_alternate && setSocAlt((prev) => [...prev, data.SoC_batt_alternate as number].slice(-defaultLength));
                            data.I_load && setCurrentLoad((prev) => [...prev, data.I_load as number].slice(-defaultLength));
                            data.I_mppt && setCurrentMPPT((prev) => [...prev, data.I_mppt as number].slice(-defaultLength));
                            data.I_batt_main && setCurrentNetMain((prev) => [...prev, data.I_batt_main as number].slice(-defaultLength));
                            data.I_batt_alternate && setCurrentNetAlt((prev) => [...prev, data.I_batt_alternate as number].slice(-defaultLength));
                            data.Corrected_I_load && setCorrectedCurrentLoad((prev) => [...prev, data.Corrected_I_load as number].slice(-defaultLength));
                            data.Corrected_I_mppt && setCorrectedCurrentMPPT((prev) => [...prev, data.Corrected_I_mppt as number].slice(-defaultLength));
                            data.Corrected_I_batt_main && setCorrectedCurrentNetMain((prev) => [...prev, data.Corrected_I_batt_main as number].slice(-defaultLength));
                            data.Corrected_I_batt_alternate && setCorrectedCurrentNetAlt((prev) => [...prev, data.Corrected_I_batt_alternate as number].slice(-defaultLength));
                        });
                    }
                } catch (error) {
                    console.error("Error fetching initial data:", error);
                }
            };
            fetchInitialData();
        }

        // Set up EventSource to listen for incoming data
        const eventSource = new EventSource("http://localhost:4000/data_stream");
        eventSource.onmessage = (event) => {
            const data: PowerData = JSON.parse(event.data);
            populateData(data);
        };

        return () => {
            eventSource.close();
        }
    }, []);

    function populateData(data: PowerData) {
        const slice_length = parseInt(lengthSliderRef.current?.value || displayDataLength.toString());
        setXData((prevXData) => [...prevXData, data.total_time].slice(-slice_length));
        data.V_batt_main && setVoltageReadingMain((prev) => [...prev, data.V_batt_main as number].slice(-slice_length));
        data.Corrected_V_batt_main && setCorrectedVoltageMain((prev) => [...prev, data.Corrected_V_batt_main as number].slice(-slice_length));
        data.OCV_batt_main && setOCVMain((prev) => [...prev, data.OCV_batt_main as number].slice(-slice_length));
        data.SoC_batt_main && setSocMain((prev) => [...prev, data.SoC_batt_main as number].slice(-slice_length));
        data.V_batt_alternate && setVoltageReadingAlt((prev) => [...prev, data.V_batt_alternate as number].slice(-slice_length));
        data.Corrected_V_batt_alternate && setCorrectedVoltageAlt((prev) => [...prev, data.Corrected_V_batt_alternate as number].slice(-slice_length));
        data.OCV_batt_alternate && setOCVAlt((prev) => [...prev, data.OCV_batt_alternate as number].slice(-slice_length));
        data.SoC_batt_alternate && setSocAlt((prev) => [...prev, data.SoC_batt_alternate as number].slice(-slice_length));
        data.I_load && setCurrentLoad((prev) => [...prev, data.I_load as number].slice(-slice_length));
        data.I_mppt && setCurrentMPPT((prev) => [...prev, data.I_mppt as number].slice(-slice_length));
        data.I_batt_main && setCurrentNetMain((prev) => [...prev, data.I_batt_main as number].slice(-slice_length));
        data.I_batt_alternate && setCurrentNetAlt((prev) => [...prev, data.I_batt_alternate as number].slice(-slice_length));
        data.Corrected_I_load && setCorrectedCurrentLoad((prev) => [...prev, data.Corrected_I_load as number].slice(-slice_length));
        data.Corrected_I_mppt && setCorrectedCurrentMPPT((prev) => [...prev, data.Corrected_I_mppt as number].slice(-slice_length));
        data.Corrected_I_batt_main && setCorrectedCurrentNetMain((prev) => [...prev, data.Corrected_I_batt_main as number].slice(-slice_length));
        data.Corrected_I_batt_alternate && setCorrectedCurrentNetAlt((prev) => [...prev, data.Corrected_I_batt_alternate as number].slice(-slice_length));
    };

    useEffect(() => {
        if (lengthSliderRef.current) {
            lengthSliderRef.current.value = displayDataLength.toString();
        }
        if (displayDataLength === 500) return
        localStorage.setItem("displayDataLength", displayDataLength.toString());
    }, [displayDataLength]);

    return (
        <div className="power-management">
            <h2>Power Management</h2>
            <p>Manage your power settings and monitor energy consumption.</p>
            <Box sx={{ width: 300 }}>
                <p>Number of points: {displayDataLength}</p>
                <Slider 
                    ref={lengthSliderRef}
                    min={50} max={1000} step={10} 
                    valueLabelDisplay="auto" 
                    value={displayDataLength} 
                    onChange={(event, value) => setDisplayDataLength(value)} />
            </Box>

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