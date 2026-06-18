import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";

export default function DynamicLineChart({ title, lineNames, xData, yData }: { title: string; lineNames: string[]; xData: number[]; yData: number[][] }) {
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
        },
        yAxis: {
            type: "value",
        },
        series: series,
        animations: true,
    };


    return (
        <ReactECharts
            ref={chartRef}
            option={option}
            style={{ height: '400px', width: '100%' }}
        />
    );
}