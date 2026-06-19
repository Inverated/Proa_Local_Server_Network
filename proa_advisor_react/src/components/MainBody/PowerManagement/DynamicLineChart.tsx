import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";

export default function DynamicLineChart({ title, lineNames, xData, yData, yUnit, yFixed }: { title: string; lineNames: string[]; xData: number[]; yData: number[][]; yUnit: string; yFixed?: boolean }) {
    // yData contains an array of useState([])
    const chartRef = useRef(null);
    
    const series = useMemo(() => {
        return lineNames.map((lineName, index) => ({
            name: lineName,
            type: "line",
            data: yData[index] || []
        }));
    }, [lineNames, yData]);


    const option = {
        title: {
            text: title,
        },
        legend: {
            top: 30,
        },
        xAxis: {
            type: "category",
            data: xData,
            minInterval: 1,
            axisLabel: {
                formatter: (value: number) => `${Number(value).toFixed(2)} s`
            }
        },
        yAxis: {
            type: "value",
            scale: yFixed ? false : true,
            axisLabel: {
                formatter: (value: number) => `${value.toFixed(4)} ${yUnit}`
            }
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
                    return `${lineName}: ${yValue.toFixed(4)} ${yUnit}`;
                });
                return `Time: ${Number(xValue).toFixed(2)} s<br>${tooltipLines.join("<br>")}`;
            }
        },
    };


    return (
        <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '400px', width: '100%' }}
        />
    );
}