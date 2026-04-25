import { useEffect, useRef } from 'react'
import { Chart as ChartJS } from 'chart.js/auto'
import type { ChartData, ChartOptions, Point } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useChartTick } from './useSimTick'

const CHART_FREQUENCY = 10
// Number of samples shown on screen. The x-axis is pinned to the last
// WINDOW samples, so the chart always displays exactly this many points.
const WINDOW = 100

interface VelocityChartProps {
  velocity: number
  yMin?: number
  yMax?: number
  label?: string
  color?: string
  height?: number
}

// Stable, mutated-in-place data and options. Chart.js prefers in-place
// mutation + `chart.update('none')` for high-frequency streaming, which
// avoids the cost of rebuilding the chart on each new sample.
//
// We use `{x, y}` Point objects so that `parsing: false` can be enabled
// (the chart consumes the data as-is, no per-frame re-parsing).
function makeInitialData(label: string, color: string): ChartData<'line', Point[]> {
  return {
    datasets: [
      {
        label,
        data: [],
        borderColor: color,
        backgroundColor: color,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: 2.4,
        pointHoverRadius: 2.4,
        borderWidth: 1.6,
        tension: 0.15,
        fill: false,
      },
    ],
  }
}

function makeOptions(yMin: number, yMax: number): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    parsing: false,
    interaction: { mode: 'nearest', intersect: false },
    scales: {
      x: {
        type: 'linear',
        display: false,
        grid: { color: '#2a2a2a' },
      },
      y: {
        min: yMin,
        max: yMax,
        grid: { color: '#2a2a2a' },
        ticks: { color: '#888', font: { size: 10 } },
        border: { color: '#2a2a2a' },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
    elements: {
      point: { hitRadius: 0 },
    },
  }
}

export default function VelocityChart({
  velocity,
  yMin = -1,
  yMax = 1.5,
  label = 'v (m/s)',
  color = '#d63cff',
  height = 180,
}: VelocityChartProps) {
  const tickChart = useChartTick(CHART_FREQUENCY)
  const chartRef = useRef<ChartJS<'line', Point[]> | null>(null)

  // Created once; mutated in place by the streaming effect below.
  const dataRef = useRef(makeInitialData(label, color))
  const optionsRef = useRef(makeOptions(yMin, yMax))

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return

    const series = chart.data.datasets[0].data as Point[]
    const last = series[series.length - 1]
    if (last && last.x === tickChart) return

    series.push({ x: tickChart, y: velocity })

    const minX = tickChart - WINDOW + 1
    while (series.length && series[0].x < minX) series.shift()

    chart.options.scales!.x!.min = minX
    chart.options.scales!.x!.max = tickChart
    chart.update('none')
  }, [tickChart, velocity])

  return (
    <div
      style={{
        width: '100%',
        height,
        background: '#1a1a1a',
        borderRadius: 6,
        boxSizing: 'border-box',
      }}
    >
      <Line ref={chartRef} data={dataRef.current} options={optionsRef.current} />
    </div>
  )
}
