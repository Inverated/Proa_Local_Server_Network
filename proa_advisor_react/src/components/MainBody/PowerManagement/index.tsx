import { useEffect, useState } from "react";
import DynammicLineChart from "./DynamicLineChart";


/* Charts:
1. Voltage Main (actual vs corrected)
2. Voltage Alt (actual vs corrected)
3. SOC Main and Alt
4. Current Load, MPPT, Net Main, Net Alt (actual vs corrected)
*/

const ARRAY_LENGTH = 20;

type PowerData = {
    timestamp: number;
    voltage_reading_main: number;
    corrected_voltage_main: number;
};

export default function PowerManagement() {
    const [xData, setXData] = useState<number[]>([]);

    const [voltageReadingMain, setVoltageReadingMain] = useState<number[]>([]);
    const [voltageReadingAlt, setVoltageReadingAlt] = useState<number[]>([]);
    const [correctedVoltageMain, setCorrectedVoltageMain] = useState<number[]>([]);
    const [correctedVoltageAlt, setCorrectedVoltageAlt] = useState<number[]>([]);

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
            setVoltageReadingMain((prev) => [...prev, data.voltage_reading_main].slice(-ARRAY_LENGTH));
            setCorrectedVoltageMain((prev) => [...prev, data.corrected_voltage_main].slice(-ARRAY_LENGTH));
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
                <DynammicLineChart title="Main Battery Voltage" lineNames={['Actual', 'Corrected']} xData={xData} yData={[voltageReadingMain, correctedVoltageMain]} />
            </div>
        </div>
    );
}