import { useState } from 'react'
import { useSimulation, useSimulationRunning } from '../app/useSimulation'
import { ScenarioLoader } from '../simulation/scenarios/ScenarioLoader'
import type { ScenarioSpec } from '../simulation/scenarios/Scenario'

interface ScenarioOption {
  label: string
  url: string
}

export interface ControlPanelProps {
  /** Notified after a scenario is parsed but BEFORE it's handed to
   *  the engine. The App uses this to seed UI state (e.g. keyboard
   *  control defaults) so it's already applied when the engine emits
   *  `reset` and `scenarioLoaded` synchronously inside `loadScenario`. */
  onScenarioLoaded?: (spec: ScenarioSpec) => void
  /**
   * When `true` the "Record while simulation runs" checkbox is
   * checked. The panel is fully controlled — all recording wiring
   * (calling `setRecordingConfig`, `startRecording`, `stopRecording`)
   * lives in `App.tsx`. App is expected to translate the flag into
   * "start recording on `started`, stop on `paused`".
   */
  recordWhileRunning?: boolean
  /** Notified when the user toggles "Record while simulation runs". */
  onRecordWhileRunningChange?: (enabled: boolean) => void
  /** Click handler for the "Save recording" button. The App wires
   *  this to `controller.exportRecording()` + `downloadReplay(...)`. */
  onSaveRecording?: () => void
  /** When `true` the Save button is disabled. Owned by the App so
   *  the disabled rule (running / replay / no frames) lives in one
   *  place. */
  saveRecordingDisabled?: boolean
  /** Optional tooltip explaining why Save is disabled. */
  saveRecordingDisabledReason?: string
}

/**
 * The full set of bundled scenarios is small and known at build time;
 * a hand-maintained list is simpler than auto-discovery and avoids a
 * runtime directory listing the public folder doesn't expose.
 *
 * To add a new scenario:
 *   1. Drop the JSON in `public/scenarios/`.
 *   2. Add a `{ label, url }` entry below.
 */
const SCENARIO_OPTIONS: readonly ScenarioOption[] = [
  { label: 'Simple scenario (auto-drive)', url: '/scenarios/simple-scenario.json' },
  { label: 'Keyboard drive (empty plaza)', url: '/scenarios/keyboard-drive.json' },
  { label: 'Reference path (S-curve)', url: '/scenarios/reference-path-scenario.json' },
  {
    label: 'Trajectory tracking enabled',
    url: '/scenarios/trajectory-tracking-enabled.json',
  },
]

export function ControlPanel({
  onScenarioLoaded,
  recordWhileRunning = false,
  onRecordWhileRunningChange,
  onSaveRecording,
  saveRecordingDisabled = false,
  saveRecordingDisabledReason,
}: ControlPanelProps = {}) {
  const { controller } = useSimulation()
  const isRunning = useSimulationRunning()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string>(SCENARIO_OPTIONS[0].url)

  const handleLoadScenario = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch + parse separately from `controller.loadScenarioFromUrl`
      // so the App can seed UI state (keyboard control defaults, etc.)
      // from the parsed spec BEFORE the engine emits `reset` and
      // `scenarioLoaded` inside `loadScenarioFromJson`.
      const spec = await ScenarioLoader.loadFromUrl(selectedUrl)
      onScenarioLoaded?.(spec)
      controller.loadScenarioFromJson(spec)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel control-panel">
      <h2>Controls</h2>
      <div className="control-buttons">
        <button onClick={() => controller.start()} disabled={isRunning}>
          Start
        </button>
        <button onClick={() => controller.pause()} disabled={!isRunning}>
          Pause
        </button>
        <button onClick={() => controller.step()} disabled={isRunning}>
          Step
        </button>
        <button onClick={() => controller.reset()}>Reset</button>
      </div>
      <div className="scenario-picker">
        <label className="scenario-picker-label" htmlFor="scenario-select">
          Scenario
        </label>
        <div className="scenario-picker-row">
          <select
            id="scenario-select"
            value={selectedUrl}
            onChange={(event) => setSelectedUrl(event.target.value)}
            disabled={loading}
          >
            {SCENARIO_OPTIONS.map((option) => (
              <option key={option.url} value={option.url}>
                {option.label}
              </option>
            ))}
          </select>
          <button onClick={handleLoadScenario} disabled={loading}>
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
        {onRecordWhileRunningChange && (
          <label
            className="scenario-picker-record-label"
            title="Capture every simulation tick while the engine is running. Recording starts on Start and stops on Pause; press Save recording afterwards to download the replay."
          >
            <input
              type="checkbox"
              checked={recordWhileRunning}
              onChange={(e) =>
                onRecordWhileRunningChange(e.target.checked)
              }
              disabled={loading}
            />
            <span>Record while simulation runs</span>
          </label>
        )}
        {onSaveRecording && (
          <div className="scenario-picker-row scenario-picker-row--save">
            <button
              type="button"
              onClick={onSaveRecording}
              disabled={saveRecordingDisabled}
              title={
                saveRecordingDisabled
                  ? saveRecordingDisabledReason
                  : 'Download the recorded simulation as a replay file'
              }
              data-testid="control-panel-save-recording"
            >
              Save recording
            </button>
            {saveRecordingDisabled && saveRecordingDisabledReason && (
              <span className="scenario-picker-save-hint">
                {saveRecordingDisabledReason}
              </span>
            )}
          </div>
        )}
      </div>
      {error && <p className="error">Failed to load scenario: {error}</p>}
    </section>
  )
}
