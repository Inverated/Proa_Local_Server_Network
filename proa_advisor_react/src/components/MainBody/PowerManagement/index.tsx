import { useEffect, useState } from "react";
import DynamicLineChart from "./DynamicLineChart";


/* Charts:
1. Voltage Main (actual vs corrected)
2. Voltage Alt (actual vs corrected)
3. SOC Main and Alt
4. Current Load, MPPT, Net Main, Net Alt (actual vs corrected)
*/

const ARRAY_LENGTH = 1000;

type PowerData = {
    timestamp: number;
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
            <div className="charts-container">
                <DynamicLineChart title="Main Battery Voltage" lineNames={['Actual', 'Corrected', 'OCV']} xData={xData} yData={[voltageReadingMain, correctedVoltageMain, OCVMain]} yUnit="V" />
                <DynamicLineChart title="Alt Battery Voltage" lineNames={['Actual', 'Corrected', 'OCV']} xData={xData} yData={[voltageReadingAlt, correctedVoltageAlt, OCVAlt]} yUnit="V" />
            </div>
            <div className="charts-container">
                <DynamicLineChart title="Main Battery SOC" lineNames={['SOC']} xData={xData} yData={[socMain]} yUnit="%" yFixed={true} />
                <DynamicLineChart title="Alt Battery SOC" lineNames={['SOC']} xData={xData} yData={[socAlt]} yUnit="%" yFixed={true} />
            </div>
            <div className="charts-container">
                <DynamicLineChart title="Current Load" lineNames={['Actual', 'Corrected']} xData={xData} yData={[currentLoad, correctedCurrentLoad]} yUnit="A" />
                <DynamicLineChart title="Current MPPT" lineNames={['Actual', 'Corrected']} xData={xData} yData={[currentMPPT, correctedCurrentMPPT]} yUnit="A" />
            </div>
            <div className="charts-container">
                <DynamicLineChart title="Current Net Main" lineNames={['Actual', 'Corrected']} xData={xData} yData={[currentNetMain, correctedCurrentNetMain]} yUnit="A" />
                <DynamicLineChart title="Current Net Alt" lineNames={['Actual', 'Corrected']} xData={xData} yData={[currentNetAlt, correctedCurrentNetAlt]} yUnit="A" />
            </div>

        </div>
    );
}