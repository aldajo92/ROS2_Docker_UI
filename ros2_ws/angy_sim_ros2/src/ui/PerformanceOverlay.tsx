import { useMemo } from 'react'
import { useSimulationProfiler } from '../app/useSimulationProfiler'
import type {
  ProfilerAggregate,
  ProfilerSnapshot,
} from '../simulation/profiling/ProfilerTypes'

export interface PerformanceOverlayProps {
  /**
   * Optional injected snapshot — used by tests to render a fixture
   * without touching the engine. Production code paths should leave
   * this undefined so the overlay subscribes to the live profiler.
   */
  snapshotOverride?: ProfilerSnapshot
  /**
   * Minimum interval (ms) between UI refreshes. Passed through to
   * {@link useSimulationProfiler}; has no effect when
   * `snapshotOverride` is supplied.
   */
  updateIntervalMs?: number
}

/**
 * Compact absolute-positioned overlay that renders the engine tick
 * profiler. Framework-only dependencies: React + plain SVG for the
 * sparkline. The overlay is renderer-agnostic — it knows nothing
 * about Three.js or Phaser.
 *
 * The passive container uses `pointer-events: none` so users can
 * still click through to the viewport below. Any interactive bits
 * (none today, but reserved for future mini-buttons) should live in
 * a sub-element that re-enables `pointer-events: auto`.
 */
export function PerformanceOverlay({
  snapshotOverride,
  updateIntervalMs,
}: PerformanceOverlayProps = {}) {
  const live = useSimulationProfiler({ updateIntervalMs })
  const snapshot = snapshotOverride ?? live

  const sortedSystems = useMemo(
    () => orderSystemsByAverage(snapshot),
    [snapshot],
  )

  return (
    <div
      className="performance-overlay"
      role="status"
      aria-label="Engine frame profiler"
    >
      <div className="performance-overlay__header">
        <span className="performance-overlay__title">Frame profiler</span>
        <span className="performance-overlay__fps">
          {formatTickRate(snapshot.ticksPerSec)}
        </span>
      </div>

      <div className="performance-overlay__summary">
        <SummaryCell
          label="Tick"
          value={formatMs(snapshot.latest?.totalDurationMs)}
        />
        <SummaryCell label="Avg" value={formatMs(snapshot.tick.avgMs)} />
        <SummaryCell label="Min" value={formatMs(snapshot.tick.minMs)} />
        <SummaryCell label="Max" value={formatMs(snapshot.tick.maxMs)} />
      </div>

      <Sparkline history={snapshot.historyMs} />

      <table className="performance-overlay__systems">
        <tbody>
          {sortedSystems.length === 0 && (
            <tr>
              <td colSpan={3} className="performance-overlay__empty">
                No samples yet — start the simulation.
              </td>
            </tr>
          )}
          {sortedSystems.map(({ name, latestMs, aggregate }) => (
            <tr key={name}>
              <td className="performance-overlay__sys-name">{name}</td>
              <td className="performance-overlay__sys-latest">
                {formatMs(latestMs)}
              </td>
              <td className="performance-overlay__sys-avg">
                {formatMs(aggregate?.avgMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="performance-overlay__footnote">
        Wall-clock diagnostics · window {snapshot.capacity} samples
      </p>
    </div>
  )
}

function SummaryCell({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="performance-overlay__cell">
      <span className="performance-overlay__cell-label">{label}</span>
      <span className="performance-overlay__cell-value">{value}</span>
    </div>
  )
}

function Sparkline({ history }: { history: readonly number[] }) {
  if (history.length < 2) {
    return (
      <svg
        className="performance-overlay__sparkline"
        viewBox="0 0 120 30"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="120" height="30" fill="transparent" />
      </svg>
    )
  }
  const width = 120
  const height = 30
  const max = Math.max(...history, 0.001)
  const step = width / Math.max(1, history.length - 1)
  const points = history
    .map((value, i) => {
      const x = i * step
      const y = height - (value / max) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')

  return (
    <svg
      className="performance-overlay__sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline fill="none" stroke="currentColor" strokeWidth="1.25" points={points} />
    </svg>
  )
}

/**
 * Flatten the per-system aggregate map into a stable, UI-friendly
 * list. We sort by descending average so the heaviest systems sit at
 * the top of the overlay (the typical "who's slow?" question).
 */
interface SystemRow {
  name: string
  aggregate: ProfilerAggregate
  latestMs: number | undefined
}

function orderSystemsByAverage(snapshot: ProfilerSnapshot): SystemRow[] {
  const latestByName = new Map<string, number>()
  if (snapshot.latest) {
    for (const sys of snapshot.latest.systems) {
      latestByName.set(sys.name, sys.durationMs)
    }
  }
  const rows: SystemRow[] = Object.entries(snapshot.perSystem).map(
    ([name, aggregate]) => ({
      name,
      aggregate,
      latestMs: latestByName.get(name),
    }),
  )
  rows.sort((a, b) => b.aggregate.avgMs - a.aggregate.avgMs)
  return rows
}

function formatMs(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  if (value === 0) return '0.00'
  if (value < 0.01) return value.toFixed(3)
  return value.toFixed(2)
}

function formatTickRate(ticksPerSec: number): string {
  if (!Number.isFinite(ticksPerSec) || ticksPerSec <= 0) return '— Hz'
  return `${ticksPerSec.toFixed(1)} Hz`
}
