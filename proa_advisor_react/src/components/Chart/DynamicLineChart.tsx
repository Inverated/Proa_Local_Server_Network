import { useMemo, useRef } from "react";
import ReactECharts from "echarts-for-react";
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

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
            name: "Time Passed" + (xData[xData.length - 1] < 60 ? " (s)" : " (min)"),
            nameLocation: "middle",
            nameGap: 30,
            data: xData,
            minInterval: 1,
            axisLabel: {
                formatter: (value: number) => value < 60 ? `${Number(value).toFixed(2)} s` : `${(value / 60).toFixed(2)} min`
            },
        },
        yAxis: {
            type: "value",
            scale: yFixed ? false : true,
            axisLabel: {
                formatter: (value: number) => `${value.toFixed(significantDigits)} ${yUnit}`
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
                    return `${lineName}: ${yValue.toFixed(significantDigits)} ${yUnit}`;
                });
                return `Time: ${Number(xValue).toFixed(2)} s<br>${tooltipLines.join("<br>")}`;
            }
        },
    };


    return (
        <Card variant="outlined" sx={{ width: '100%' }}>
            <CardContent>
                <h3>{title}</h3>
                <ReactECharts
                    ref={chartRef}
                    option={option}
                    style={{ height: '400px', width: '100%' }}
                />
            </CardContent>
        </Card>
    );
}