import { useRef, useEffect } from 'react'
import { useChartTick } from './useSimTick'

const CHART_FREQUENCY = 10
const MAX_POINTS = 200
const WIDTH = 400
const HEIGHT = 150
const PADDING = { top: 10, right: 10, bottom: 25, left: 40 }

const plotW = WIDTH - PADDING.left - PADDING.right
const plotH = HEIGHT - PADDING.top - PADDING.bottom

interface VelocityChartProps {
  velocity: number
  yMin?: number
  yMax?: number
}

export default function VelocityChart({ velocity, yMin = -1, yMax = 1.5 }: VelocityChartProps) {
  const tickChart = useChartTick(CHART_FREQUENCY)
  const bufferRef = useRef<{ tick: number; v: number }[]>([])

  useEffect(() => {
    const buf = bufferRef.current
    if (buf.length === 0 || buf[buf.length - 1].tick !== tickChart) {
      buf.push({ tick: tickChart, v: velocity })
      if (buf.length > MAX_POINTS) buf.shift()
    }
  }, [tickChart, velocity])

  const data = bufferRef.current
  if (data.length < 2) return null

  const xStart = data[0].tick
  const xEnd = data[data.length - 1].tick
  const xRange = xEnd - xStart || 1
  const yRange = yMax - yMin

  const toX = (tick: number) => PADDING.left + ((tick - xStart) / xRange) * plotW
  const toY = (v: number) => PADDING.top + (1 - (v - yMin) / yRange) * plotH

  const pathD = data
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.tick).toFixed(1)},${toY(p.v).toFixed(1)}`)
    .join(' ')

  const yTicks = 5
  const yStep = yRange / yTicks

  return (
    <svg width={WIDTH} height={HEIGHT} style={{ background: '#1a1a1a', borderRadius: 6 }}>
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = yMin + i * yStep
        const y = toY(val)
        return (
          <g key={i}>
            <line x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} stroke="#333" strokeWidth={0.5} />
            <text x={PADDING.left - 4} y={y + 3} fill="#888" fontSize={9} textAnchor="end">
              {val.toFixed(1)}
            </text>
          </g>
        )
      })}

      {/* zero line */}
      <line
        x1={PADDING.left} x2={WIDTH - PADDING.right}
        y1={toY(0)} y2={toY(0)}
        stroke="#555" strokeWidth={1} strokeDasharray="4 2"
      />

      <path d={pathD} fill="none" stroke="#00ccff" strokeWidth={1.5} />

      <text x={WIDTH / 2} y={HEIGHT - 4} fill="#888" fontSize={10} textAnchor="middle">
        tickChart
      </text>
      <text x={12} y={HEIGHT / 2} fill="#888" fontSize={10} textAnchor="middle" transform={`rotate(-90,12,${HEIGHT / 2})`}>
        v (m/s)
      </text>
    </svg>
  )
}
