import type { ChangeEvent } from 'react'
import type {
  ThreeTrajectoryVisualizationConfig,
} from './renderers/three/config/ThreeRendererConfig'
import type {
  TrajectorySamplingMode,
  TrajectoryTrackingConfig,
} from '../simulation/trajectories/TrajectoryTrackingConfig'

export interface RendererSettingsPanelProps {
  trajectoryTrackingConfig: TrajectoryTrackingConfig
  onTrajectoryTrackingChange: (next: TrajectoryTrackingConfig) => void
  trajectoryVisualization: ThreeTrajectoryVisualizationConfig
  onTrajectoryVisualizationChange: (
    next: ThreeTrajectoryVisualizationConfig,
  ) => void
  onClearTrajectories: () => void
  trajectoryDebugEnabled: boolean
  onTrajectoryDebugEnabledChange: (enabled: boolean) => void
  onExportTrajectoryDebug: () => void
  onClearTrajectoryDebug: () => void
  /** Which renderer is currently mounted; the renderer-side debug button
   *  changes its label and applicability based on this. */
  activeRendererType?: 'three' | 'phaser'
  /** Captures a renderer-specific debug snapshot (Three: GPU lines /
   *  buffer attribute / material; Phaser: Graphics objects / drawn
   *  point count / screen positions). */
  onExportActiveRendererDebug?: () => void
  /**
   * Render-pipeline debug logging (RosbridgeRenderableTopics ->
   * ExternalPathRenderSystem -> Three.js renderer). Independent of the
   * trajectory tracker above. When enabled, structured logs are
   * captured into an in-memory ring buffer; Export produces a JSON
   * download similar to the trajectory debug exporter.
   */
  renderDebugEnabled: boolean
  onRenderDebugEnabledChange: (enabled: boolean) => void
  onExportRenderDebug: () => void
  onClearRenderDebug: () => void
  /** Live entry count of the render-debug ring buffer (for the hint). */
  renderDebugEntryCount: number
}

/**
 * Inspector: simulation trajectory **tracking** vs Three.js **visualization**.
 * Tracking updates `TrajectoryTrackingSystem`; visualization is renderer-only.
 */
export function RendererSettingsPanel({
  trajectoryTrackingConfig,
  onTrajectoryTrackingChange,
  trajectoryVisualization,
  onTrajectoryVisualizationChange,
  onClearTrajectories,
  trajectoryDebugEnabled,
  onTrajectoryDebugEnabledChange,
  onExportTrajectoryDebug,
  onClearTrajectoryDebug,
  activeRendererType,
  onExportActiveRendererDebug,
  renderDebugEnabled,
  onRenderDebugEnabledChange,
  onExportRenderDebug,
  onClearRenderDebug,
  renderDebugEntryCount,
}: Readonly<RendererSettingsPanelProps>) {
  const patchTracking = (partial: Partial<TrajectoryTrackingConfig>) => {
    onTrajectoryTrackingChange({ ...trajectoryTrackingConfig, ...partial })
  }

  const patchViz = (
    partial: Partial<ThreeTrajectoryVisualizationConfig>,
  ) => {
    onTrajectoryVisualizationChange({
      ...trajectoryVisualization,
      ...partial,
    })
  }

  const onNumberTracking =
    <K extends keyof TrajectoryTrackingConfig>(
      key: K,
      sanitize: (n: number) => number,
    ) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      const parsed = raw === '' ? Number.NaN : Number(raw)
      if (!Number.isFinite(parsed)) return
      patchTracking({ [key]: sanitize(parsed) } as Partial<TrajectoryTrackingConfig>)
    }

  const onNumberViz =
    <K extends keyof ThreeTrajectoryVisualizationConfig>(
      key: K,
      sanitize: (n: number) => number,
    ) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value
      const parsed = raw === '' ? Number.NaN : Number(raw)
      if (!Number.isFinite(parsed)) return
      patchViz({ [key]: sanitize(parsed) } as Partial<ThreeTrajectoryVisualizationConfig>)
    }

  const trackTimeWindow =
    trajectoryTrackingConfig.defaultSamplingMode === 'timeWindow'

  return (
    <>
      <section className="panel renderer-settings">
        <h2>Trajectory tracking (simulation)</h2>
        <p className="renderer-settings-hint">
          Configure sampling into <code>state.trajectories</code>. Per-entity
          overrides can be set in scenario JSON (<code>trajectoryTracking</code>
          ).
        </p>
        <div className="renderer-settings-grid">
          <label className="renderer-settings-row renderer-settings-row--checkbox">
            <input
              type="checkbox"
              checked={!!trajectoryTrackingConfig.enabled}
              onChange={(e) => patchTracking({ enabled: e.target.checked })}
            />
            <span>Tracking enabled</span>
          </label>

          <label className="renderer-settings-row renderer-settings-row--checkbox">
            <input
              type="checkbox"
              checked={!!trajectoryTrackingConfig.trackAllSupportedEntities}
              onChange={(e) =>
                patchTracking({
                  trackAllSupportedEntities: e.target.checked,
                })
              }
            />
            <span>Track all supported entities</span>
          </label>

          <label className="renderer-settings-row">
            <span>Default sampling mode</span>
            <select
              value={trajectoryTrackingConfig.defaultSamplingMode ?? 'pointCount'}
              onChange={(e) =>
                patchTracking({
                  defaultSamplingMode: e.target.value as TrajectorySamplingMode,
                })
              }
            >
              <option value="pointCount">Last samples (count)</option>
              <option value="timeWindow">Time window</option>
            </select>
          </label>

          <label className="renderer-settings-row">
            <span>Default max samples</span>
            <input
              type="number"
              min={2}
              step={1}
              value={trajectoryTrackingConfig.defaultMaxSamples ?? 500}
              onChange={onNumberTracking('defaultMaxSamples', (n) =>
                Math.max(2, Math.floor(n)),
              )}
            />
          </label>

          {trackTimeWindow && (
            <label className="renderer-settings-row">
              <span>Default time window (s)</span>
              <input
                type="number"
                min={0.01}
                step={0.1}
                value={trajectoryTrackingConfig.defaultTimeWindowSec ?? 10}
                onChange={onNumberTracking('defaultTimeWindowSec', (n) =>
                  Math.max(0.01, n),
                )}
              />
            </label>
          )}

          <label className="renderer-settings-row">
            <span>Default min sample Δt (s)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={trajectoryTrackingConfig.defaultMinSampleDtSec ?? 0}
              onChange={onNumberTracking('defaultMinSampleDtSec', (n) =>
                Math.max(0, n),
              )}
            />
          </label>

          <label className="renderer-settings-row">
            <span>Default min distance (m)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={trajectoryTrackingConfig.defaultMinDistance ?? 0}
              onChange={onNumberTracking('defaultMinDistance', (n) =>
                Math.max(0, n),
              )}
            />
          </label>
        </div>
      </section>

      <section className="panel renderer-settings">
        <h2>Trajectory / trail visualization (Three.js)</h2>
        <div className="renderer-settings-grid">
          <label className="renderer-settings-row renderer-settings-row--checkbox">
            <input
              type="checkbox"
              checked={trajectoryVisualization.enabled}
              onChange={(e) => patchViz({ enabled: e.target.checked })}
            />
            <span>Show trajectories</span>
          </label>

          <label className="renderer-settings-row">
            <span>Height (m)</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={trajectoryVisualization.height}
              onChange={onNumberViz('height', (n) => Math.max(0, n))}
            />
          </label>

          <label className="renderer-settings-row">
            <span>Color</span>
            <input
              type="color"
              value={trajectoryVisualization.color}
              onChange={(e) => patchViz({ color: e.target.value })}
            />
          </label>

          <label className="renderer-settings-row">
            <span>
              Opacity
              <span className="renderer-settings-value">
                {trajectoryVisualization.opacity.toFixed(2)}
              </span>
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={trajectoryVisualization.opacity}
              onChange={onNumberViz('opacity', clamp01)}
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
              value={trajectoryVisualization.lineWidth}
              onChange={onNumberViz('lineWidth', (n) =>
                Math.max(1, Math.floor(n)),
              )}
            />
          </label>
        </div>
        <div className="renderer-settings-actions">
          <button type="button" onClick={onClearTrajectories}>
            Clear trajectories
          </button>
        </div>
      </section>

      <section className="panel renderer-settings">
        <h2>Trajectory debug logging</h2>
        <div className="renderer-settings-grid">
          <label className="renderer-settings-row renderer-settings-row--checkbox">
            <input
              type="checkbox"
              checked={trajectoryDebugEnabled}
              onChange={(e) => onTrajectoryDebugEnabledChange(e.target.checked)}
            />
            <span>Enable per-tick debug records</span>
          </label>
        </div>
        <div className="renderer-settings-actions">
          <button type="button" onClick={onExportTrajectoryDebug}>
            Export trajectory debug log
          </button>
          <button type="button" onClick={onClearTrajectoryDebug}>
            Clear debug log
          </button>
        </div>
        {onExportActiveRendererDebug && (
          <>
            <p className="renderer-settings-hint">
              Active renderer debug snapshot:&nbsp;
              {activeRendererType === 'phaser'
                ? 'per-line Graphics objects, drawn point counts, and screen positions.'
                : 'per-line geometry/material, position-attribute count, and bounding box.'}
              &nbsp;Logged to console and exported as JSON.
            </p>
            <div className="renderer-settings-actions">
              <button type="button" onClick={onExportActiveRendererDebug}>
                Export {activeRendererType === 'phaser' ? 'Phaser' : 'Three'}{' '}
                trajectory renderer debug
              </button>
            </div>
          </>
        )}
      </section>

      <section className="panel renderer-settings">
        <h2>Render pipeline debug logging</h2>
        <p className="renderer-settings-hint">
          Captures structured logs from the rosbridge → simulation → Three.js
          path under tags <code>[TopicData]</code>, <code>[Tick]</code>,{' '}
          <code>[ThreeRenderer]</code>, <code>[ThreePath]</code>. Used to
          diagnose freezes / stalls when dynamic paths are published at high
          rates. Lines also print to the browser console while enabled.
        </p>
        <div className="renderer-settings-grid">
          <label className="renderer-settings-row renderer-settings-row--checkbox">
            <input
              type="checkbox"
              checked={renderDebugEnabled}
              onChange={(e) => onRenderDebugEnabledChange(e.target.checked)}
              data-testid="render-debug-enabled"
            />
            <span>Enable render pipeline logs</span>
          </label>
        </div>
        <p className="renderer-settings-hint">
          Buffered entries: <strong>{renderDebugEntryCount}</strong>
        </p>
        <div className="renderer-settings-actions">
          <button
            type="button"
            onClick={onExportRenderDebug}
            data-testid="render-debug-export"
            disabled={renderDebugEntryCount === 0}
          >
            Export render debug log
          </button>
          <button
            type="button"
            onClick={onClearRenderDebug}
            data-testid="render-debug-clear"
            disabled={renderDebugEntryCount === 0}
          >
            Clear debug log
          </button>
        </div>
      </section>
    </>
  )
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}
