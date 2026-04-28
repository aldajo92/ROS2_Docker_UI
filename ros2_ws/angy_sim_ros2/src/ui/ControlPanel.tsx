import { useState } from 'react'
import { useSimulation, useSimulationRunning } from '../app/useSimulation'
import { ScenarioLoader } from '../simulation/scenarios/ScenarioLoader'
import type { ScenarioSpec } from '../simulation/scenarios/Scenario'
import {
  RENDERER_LABELS,
  type RendererType,
} from './viewport/RendererType'

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
  /** Currently active renderer adapter. Owned by the App; the panel
   *  only reads it and emits change events. */
  rendererType?: RendererType
  /** Notified when the user picks a different renderer. The App
   *  swaps which viewport is mounted; the engine is untouched. */
  onRendererTypeChange?: (next: RendererType) => void
}

/** Order of renderer options in the dropdown. */
const RENDERER_OPTIONS: readonly RendererType[] = ['three', 'phaser']

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
  rendererType,
  onRendererTypeChange,
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
      </div>
      {error && <p className="error">Failed to load scenario: {error}</p>}
      {rendererType !== undefined && onRendererTypeChange && (
        <div className="renderer-picker">
          <label className="renderer-picker-label" htmlFor="renderer-select">
            Renderer
          </label>
          <select
            id="renderer-select"
            value={rendererType}
            onChange={(event) =>
              onRendererTypeChange(event.target.value as RendererType)
            }
          >
            {RENDERER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {RENDERER_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      )}
    </section>
  )
}
