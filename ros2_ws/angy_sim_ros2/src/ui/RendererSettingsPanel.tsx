import type { ChangeEvent } from 'react'
import type {
  ThreeTrailConfig,
  TrailSamplingMode,
} from './renderers/three/config/ThreeRendererConfig'

export interface RendererSettingsPanelProps {
  trailConfig: ThreeTrailConfig
  onTrailConfigChange: (next: ThreeTrailConfig) => void
  onClearTrails: () => void
}

/**
 * Inspector panel for renderer-only visual settings. Lives in `ui/`
 * because everything it touches is renderer state, not simulation
 * state — the simulation core never sees these values.
 *
 * Validation is applied here at the input boundary so the parent
 * never sees obviously broken values; `ThreeTrailRenderer.setConfig`
 * additionally clamps defensively.
 */
export function RendererSettingsPanel({
  trailConfig,
  onTrailConfigChange,
  onClearTrails,
}: RendererSettingsPanelProps) {
  const update = <K extends keyof ThreeTrailConfig>(
    key: K,
    value: ThreeTrailConfig[K],
  ) => {
    onTrailConfigChange({ ...trailConfig, [key]: value })
  }

  const onNumberInput =
    <K extends keyof ThreeTrailConfig>(key: K, sanitize: (n: number) => number) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      // Allow the field to clear momentarily without snapping to a
      // default; we only push numeric updates.
      const parsed = raw === '' ? Number.NaN : Number(raw)
      if (!Number.isFinite(parsed)) return
      update(key, sanitize(parsed) as ThreeTrailConfig[K])
    }

  const isTimeWindow = trailConfig.samplingMode === 'timeWindow'

  return (
    <section className="panel renderer-settings">
      <h2>Trail Visualization</h2>
      <div className="renderer-settings-grid">
        <label className="renderer-settings-row renderer-settings-row--checkbox">
          <input
            type="checkbox"
            checked={trailConfig.enabled}
            onChange={(e) => update('enabled', e.target.checked)}
          />
          <span>Show trail</span>
        </label>

        <label className="renderer-settings-row">
          <span>Sampling mode</span>
          <select
            value={trailConfig.samplingMode}
            onChange={(e) =>
              update('samplingMode', e.target.value as TrailSamplingMode)
            }
          >
            <option value="pointCount">Last samples</option>
            <option value="timeWindow">Time window</option>
          </select>
        </label>

        <label className="renderer-settings-row">
          <span>Max points</span>
          <input
            type="number"
            min={2}
            step={1}
            value={trailConfig.maxPoints}
            onChange={onNumberInput('maxPoints', (n) =>
              Math.max(2, Math.floor(n)),
            )}
          />
        </label>

        {isTimeWindow && (
          <>
            <label className="renderer-settings-row">
              <span>Time window (s)</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={trailConfig.timeWindowSec}
                onChange={onNumberInput('timeWindowSec', (n) =>
                  // 0.1 s floor so the field can't be edited into the
                  // "drops every sample as it lands" regime.
                  Math.max(0.1, n),
                )}
              />
            </label>

            <label className="renderer-settings-row">
              <span>Min sample dt (s)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                value={trailConfig.minSampleDtSec}
                onChange={onNumberInput('minSampleDtSec', (n) =>
                  Math.max(0, n),
                )}
              />
            </label>
          </>
        )}

        <label className="renderer-settings-row">
          <span>Min distance (m)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={trailConfig.minDistance}
            onChange={onNumberInput('minDistance', (n) => Math.max(0, n))}
          />
        </label>

        <label className="renderer-settings-row">
          <span>Height (m)</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={trailConfig.height}
            onChange={onNumberInput('height', (n) => Math.max(0, n))}
          />
        </label>

        <label className="renderer-settings-row">
          <span>Color</span>
          <input
            type="color"
            value={trailConfig.color}
            onChange={(e) => update('color', e.target.value)}
          />
        </label>

        <label className="renderer-settings-row">
          <span>
            Opacity
            <span className="renderer-settings-value">
              {trailConfig.opacity.toFixed(2)}
            </span>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={trailConfig.opacity}
            onChange={onNumberInput('opacity', clamp01)}
          />
        </label>

        <label className="renderer-settings-row">
          <span>
            Line width
            <span className="renderer-settings-hint">best-effort</span>
          </span>
          <input
            type="number"
            min={1}
            step={1}
            value={trailConfig.lineWidth}
            onChange={onNumberInput('lineWidth', (n) =>
              Math.max(1, Math.floor(n)),
            )}
          />
        </label>
      </div>
      <div className="renderer-settings-actions">
        <button type="button" onClick={onClearTrails}>
          Clear trails
        </button>
      </div>
    </section>
  )
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}
