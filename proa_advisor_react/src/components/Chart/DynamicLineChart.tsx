import { useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Box from "@mui/material/Box";

type DynamicLineChartProps = {
    title: string;
    lineNames: string[];
    xAxis: {
        xData: number[];
    };
    yAxis: {
        yData: number[][];
        yUnit: string;
        significantDigits?: number;
        yTitle?: string;
        yFixed?: boolean;
    };
};

export default function DynamicLineChart({ title, lineNames, xAxis, yAxis }: DynamicLineChartProps) {
    // yData contains an array of useState([])
    const { xData } = xAxis;
    const { yData, yUnit, significantDigits = 4, yTitle, yFixed = false } = yAxis;
    const chartRef = useRef(null);
    const [scaleY, setScaleY] = useState(yFixed);

    const series = useMemo(() => {
        return lineNames.map((lineName, index) => ({
            name: lineName,
            type: "line",
            data: yData[index] || []
        }));
    }, [lineNames, yData]);


    const option = {
        legend: {
            top: 30,
        },
        xAxis: {
            type: "category",
            name: "Time Passed",
            nameLocation: "middle",
            nameGap: 30,
            data: xData,
            minInterval: 1,
            axisLabel: {
                formatter: (value: number) => formatTime(Number(value))
            },
        },

        yAxis: {
            type: "value",
            scale: scaleY ? false : true,
            axisLabel: {
                formatter: (value: number) => `${value.toFixed(significantDigits)
                    } ${yUnit}`
            },
            name: yTitle ? `${yTitle} (${yUnit})` : "",
            nameLocation: "middle",
            nameGap: 30
        },
        series: series,
        animations: true,
        tooltip: {
            trigger: "axis",
            formatter: (params: any) => {
                const xValue = params[0].axisValue;
                const tooltipLines = params.map((param: any) => {
                    const lineName = param.seriesName;
                    const yValue = param.data;
                    return `${lineName}: ${yValue.toFixed(significantDigits)} ${yUnit} `;
                });
                return `Time: ${formatTime(Number(xValue))} <br> ${tooltipLines.join("<br>")} `;
            }
        },
        minInterval: 0.05,
    };

    function formatTime(seconds: number): string {
        seconds = Math.abs(seconds); // Ensure seconds is positive
        if (seconds < 60) {
            return `${seconds.toFixed(2)} s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            return `${minutes} min ${remainingSeconds.toFixed(0)} s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const remainingMinutes = Math.floor((seconds % 3600) / 60);
            return `${hours} hr ${remainingMinutes.toFixed(0)} min`;
        }
    }

    return (
        <Card variant="outlined" sx={{ width: '100%' }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <h3 style={{ marginLeft: '30%', width: "60%" }}>{title}</h3>
                    <label style={{ width: '30%', textAlign: 'right', fontSize: '0.75rem', color: '#555' }}>
                        <input type="checkbox" checked={scaleY} onChange={(e) => setScaleY(e.target.checked)} />
                        Fix Y-Axis
                    </label>
                </Box>
                <ReactECharts
                    ref={chartRef}
                    option={option}
                    style={{ height: '400px', width: '100%' }}
                />
            </CardContent>
        </Card>
    );
}