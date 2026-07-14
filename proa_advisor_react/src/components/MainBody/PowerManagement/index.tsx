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

const ARRAY_LENGTH = 1000;

export default function PowerManagement({data}: {data: PowerData | null}) {
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
                    const response = await fetch("/initial_data");
                    const initialData: PowerData[] = await response.json();
                    console.log("Fetched initial data:", initialData);
                    if (initialData && initialData.length > 0) {
                            console.log("Initial data:", initialData);
                            setXData(initialData[0].total_time.slice(0, defaultLength));
                            initialData[0].V_batt_main != undefined && setVoltageReadingMain(initialData[0].V_batt_main.slice(0, defaultLength));
                            initialData[0].Corrected_V_batt_main != undefined && setCorrectedVoltageMain(initialData[0].Corrected_V_batt_main.slice(0, defaultLength));
                            initialData[0].OCV_batt_main != undefined && setOCVMain(initialData[0].OCV_batt_main.slice(0, defaultLength));
                            initialData[0].SoC_batt_main != undefined && setSocMain(initialData[0].SoC_batt_main.slice(0, defaultLength));
                            initialData[0].V_batt_alternate != undefined && setVoltageReadingAlt(initialData[0].V_batt_alternate.slice(0, defaultLength));
                            initialData[0].Corrected_V_batt_alternate != undefined && setCorrectedVoltageAlt(initialData[0].Corrected_V_batt_alternate.slice(0, defaultLength));
                            initialData[0].OCV_batt_alternate != undefined && setOCVAlt(initialData[0].OCV_batt_alternate.slice(0, defaultLength));
                            initialData[0].SoC_batt_alternate != undefined && setSocAlt(initialData[0].SoC_batt_alternate.slice(0, defaultLength));
                            initialData[0].I_load != undefined && setCurrentLoad(initialData[0].I_load.slice(0, defaultLength));
                            initialData[0].I_mppt != undefined && setCurrentMPPT(initialData[0].I_mppt.slice(0, defaultLength));
                            initialData[0].I_batt_main != undefined && setCurrentNetMain(initialData[0].I_batt_main.slice(0, defaultLength));
                            initialData[0].I_batt_alternate != undefined && setCurrentNetAlt(initialData[0].I_batt_alternate.slice(0, defaultLength));
                            initialData[0].Corrected_I_load != undefined && setCorrectedCurrentLoad(initialData[0].Corrected_I_load.slice(0, defaultLength));
                            initialData[0].Corrected_I_mppt != undefined && setCorrectedCurrentMPPT(initialData[0].Corrected_I_mppt.slice(0, defaultLength));
                            initialData[0].Corrected_I_batt_main != undefined && setCorrectedCurrentNetMain(initialData[0].Corrected_I_batt_main.slice(0, defaultLength));
                            initialData[0].Corrected_I_batt_alternate != undefined && setCorrectedCurrentNetAlt(initialData[0].Corrected_I_batt_alternate.slice(0, defaultLength));
                    }
                } catch (error) {
                    console.error("Error fetching initial data:", error);
                }
            };
            fetchInitialData();
        }
    }, []);

    useEffect(() => {
        if (data) {
            populateData(data);
        }
    }, [data]);

    function populateData(data: PowerData) {
        const slice_length = parseInt(lengthSliderRef.current?.value || displayDataLength.toString());
        setXData((prevXData) => [...prevXData, data.total_time].slice(-slice_length));
        data.V_batt_main != undefined && setVoltageReadingMain((prev) => [...prev, data.V_batt_main as number].slice(-slice_length));
        data.Corrected_V_batt_main != undefined && setCorrectedVoltageMain((prev) => [...prev, data.Corrected_V_batt_main as number].slice(-slice_length));
        data.OCV_batt_main != undefined && setOCVMain((prev) => [...prev, data.OCV_batt_main as number].slice(-slice_length));
        data.SoC_batt_main != undefined && setSocMain((prev) => [...prev, data.SoC_batt_main as number].slice(-slice_length));
        data.V_batt_alternate != undefined && setVoltageReadingAlt((prev) => [...prev, data.V_batt_alternate as number].slice(-slice_length));
        data.Corrected_V_batt_alternate != undefined && setCorrectedVoltageAlt((prev) => [...prev, data.Corrected_V_batt_alternate as number].slice(-slice_length));
        data.OCV_batt_alternate != undefined && setOCVAlt((prev) => [...prev, data.OCV_batt_alternate as number].slice(-slice_length));
        data.SoC_batt_alternate != undefined && setSocAlt((prev) => [...prev, data.SoC_batt_alternate as number].slice(-slice_length));
        data.I_load != undefined && setCurrentLoad((prev) => [...prev, data.I_load as number].slice(-slice_length));
        data.I_mppt != undefined && setCurrentMPPT((prev) => [...prev, data.I_mppt as number].slice(-slice_length));
        data.I_batt_main != undefined && setCurrentNetMain((prev) => [...prev, data.I_batt_main as number].slice(-slice_length));
        data.I_batt_alternate != undefined && setCurrentNetAlt((prev) => [...prev, data.I_batt_alternate as number].slice(-slice_length));
        data.Corrected_I_load != undefined && setCorrectedCurrentLoad((prev) => [...prev, data.Corrected_I_load as number].slice(-slice_length));
        data.Corrected_I_mppt != undefined && setCorrectedCurrentMPPT((prev) => [...prev, data.Corrected_I_mppt as number].slice(-slice_length));
        data.Corrected_I_batt_main != undefined && setCorrectedCurrentNetMain((prev) => [...prev, data.Corrected_I_batt_main as number].slice(-slice_length));
        data.Corrected_I_batt_alternate != undefined && setCorrectedCurrentNetAlt((prev) => [...prev, data.Corrected_I_batt_alternate as number].slice(-slice_length));
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
            <Box sx={{ width: 300 }}>
                <p>Number of points: {displayDataLength}</p>
                <Slider 
                    ref={lengthSliderRef}
                    min={5} max={1000} step={5} 
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
                                significantDigits: 3
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
                                    significantDigits: 3
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