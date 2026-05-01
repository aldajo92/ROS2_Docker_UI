/**
 * Inspector card exposing the {@link PerformanceOverlay} toggle and
 * its UI refresh cadence. Dumb / controlled component: owns no
 * profiler state and calls back out to `App.tsx` for both the
 * visibility flag and the update interval.
 */
export interface PerformancePanelProps {
  showPerformanceOverlay: boolean
  onShowPerformanceOverlayChange: (next: boolean) => void
  /**
   * Minimum interval (ms) between overlay refreshes. `0` means update
   * on every tick. The profiler itself always samples at full tick
   * rate — only the UI flush is throttled.
   */
  updateIntervalMs: number
  onUpdateIntervalMsChange: (next: number) => void
}

interface IntervalPreset {
  label: string
  valueMs: number
}

/**
 * Presets chosen to cover the common readability targets: every tick
 * (raw), 10 Hz (pleasant but responsive), 4 Hz (default — numbers are
 * easy to read), 2 Hz / 1 Hz (for long observation runs). Raw values
 * are embedded in the label so users can map between Hz and ms at a
 * glance.
 */
const INTERVAL_PRESETS: readonly IntervalPreset[] = [
  { label: 'Every tick (realtime)', valueMs: 0 },
  { label: '10 Hz (100 ms)', valueMs: 100 },
  { label: '4 Hz (250 ms)', valueMs: 250 },
  { label: '2 Hz (500 ms)', valueMs: 500 },
  { label: '1 Hz (1000 ms)', valueMs: 1000 },
]

/**
 * Resolve the select value. `PerformancePanel` only allows the preset
 * set so this is a lookup, but we defensively fall back to the
 * nearest preset when an out-of-band value arrives (e.g. a future
 * programmatic override from App.tsx).
 */
function findPresetValue(valueMs: number): number {
  if (INTERVAL_PRESETS.some((p) => p.valueMs === valueMs)) return valueMs
  let nearest = INTERVAL_PRESETS[0]
  let bestDelta = Math.abs(valueMs - nearest.valueMs)
  for (const preset of INTERVAL_PRESETS) {
    const delta = Math.abs(valueMs - preset.valueMs)
    if (delta < bestDelta) {
      bestDelta = delta
      nearest = preset
    }
  }
  return nearest.valueMs
}

export function PerformancePanel({
  showPerformanceOverlay,
  onShowPerformanceOverlayChange,
  updateIntervalMs,
  onUpdateIntervalMsChange,
}: PerformancePanelProps) {
  const selectedMs = findPresetValue(updateIntervalMs)
  return (
    <section className="panel performance-panel" aria-label="Performance">
      <h2>Performance</h2>
      <label className="performance-panel-toggle">
        <input
          type="checkbox"
          checked={showPerformanceOverlay}
          onChange={(e) => onShowPerformanceOverlayChange(e.target.checked)}
        />
        <span>Show performance overlay</span>
      </label>
      <div className="performance-panel-row">
        <label
          className="performance-panel-row-label"
          htmlFor="performance-panel-interval"
        >
          Refresh rate
        </label>
        <select
          id="performance-panel-interval"
          className="performance-panel-select"
          value={selectedMs}
          disabled={!showPerformanceOverlay}
          onChange={(e) =>
            onUpdateIntervalMsChange(Number.parseInt(e.target.value, 10))
          }
        >
          {INTERVAL_PRESETS.map((preset) => (
            <option key={preset.valueMs} value={preset.valueMs}>
              {preset.label}
            </option>
          ))}
        </select>
      </div>
      <p className="performance-panel-hint">
        Wall-clock tick breakdown pinned to the top-left of the
        viewport. Diagnostic only — never alters simulation behavior.
        The profiler always samples every tick; this control only
        throttles how often the overlay redraws.
      </p>
    </section>
  )
}
