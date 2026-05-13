import { useRef, useState, type ChangeEvent } from 'react'
import { useSimulation } from '../app/useSimulation'
import { ScenarioLoader } from '../simulation/scenarios/ScenarioLoader'
import type { ScenarioSpec } from '../simulation/scenarios/Scenario'
import { readScenarioFromFile } from './scenario/ScenarioFileLoader'

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
  /** Notified with the original `File.name` when a scenario is
   *  successfully uploaded from a local file. App uses this to seed
   *  the Scenario Editor toolbar filename. */
  onUploadedFileName?: (fileName: string) => void
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
  {
    label: 'Rectangle obstacles (wall + yawed box)',
    url: '/scenarios/rectangle-obstacles.json',
  },
  {
    label: 'Rectangle corridor (keyboard drive)',
    url: '/scenarios/rectangle-corridor.json',
  },
  {
    label: 'Rectangle slalom (auto-drive panels)',
    url: '/scenarios/rectangle-slalom.json',
  },
  {
    label: 'Noisy pose publisher (ROS 2 PoseWithCovarianceStamped)',
    url: '/scenarios/noisy-pose-publisher.json',
  },
  {
    label: 'Lidar demo (2D lidar sensor with static obstacles)',
    url: '/scenarios/lidar-demo.json',
  },
  {
    label: 'Lidar + keyboard drive (enclosed room)',
    url: '/scenarios/lidar-keyboard.json',
  },
]

export function ControlPanel({
  onScenarioLoaded,
  onUploadedFileName,
  recordWhileRunning = false,
  onRecordWhileRunningChange,
  onSaveRecording,
  saveRecordingDisabled = false,
  saveRecordingDisabledReason,
}: ControlPanelProps = {}) {
  const { controller } = useSimulation()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string>(SCENARIO_OPTIONS[0].url)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)

  const applyScenario = (spec: ScenarioSpec) => {
    onScenarioLoaded?.(spec)
    controller.loadScenarioFromJson(spec)
  }

  const handleLoadScenario = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch + parse separately from `controller.loadScenarioFromUrl`
      // so the App can seed UI state (keyboard control defaults, etc.)
      // from the parsed spec BEFORE the engine emits `reset` and
      // `scenarioLoaded` inside `loadScenarioFromJson`.
      const spec = await ScenarioLoader.loadFromUrl(selectedUrl)
      applyScenario(spec)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleUploadClick = () => {
    if (loading) return
    uploadInputRef.current?.click()
  }

  const handleUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    // Always reset the input so the user can re-pick the same file
    // after a failed parse — `<input type="file">` only fires `change`
    // when the selection actually changes.
    input.value = ''
    if (!file) return
    setLoading(true)
    setError(null)
    try {
      const result = await readScenarioFromFile(file)
      if (result.ok) {
        applyScenario(result.spec)
        onUploadedFileName?.(file.name)
      } else {
        setError(result.error)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="panel control-panel">
      <h2>Scenario</h2>
      <div className="scenario-picker">
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
        <div className="scenario-picker-row scenario-picker-row--upload">
          <button
            type="button"
            onClick={handleUploadClick}
            disabled={loading}
            title="Load a scenario from a local JSON file"
            data-testid="control-panel-upload-scenario"
          >
            Upload scenario JSON
          </button>
          <input
            ref={uploadInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={handleUploadChange}
            data-testid="control-panel-upload-input"
          />
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
