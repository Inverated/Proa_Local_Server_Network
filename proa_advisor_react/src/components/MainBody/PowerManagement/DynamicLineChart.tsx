import { LineChart } from '@mui/x-charts/LineChart';

export default function DynamicLineChart() {
    const data = [10, 15, 12, 18, 22, 19, 25];

    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    return (
        <LineChart
            width={500}
            height={300}
            series={[
                {
                    data,
                    label: 'Sales',
                },
            ]}
            xAxis={[
                {
                    scaleType: 'point',
                    data: labels,
                },
            ]}
        />
    );
}