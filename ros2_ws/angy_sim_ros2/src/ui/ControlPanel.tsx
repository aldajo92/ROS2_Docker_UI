import { useState } from 'react'
import { useSimulation, useSimulationRunning } from '../app/useSimulation'

interface ScenarioOption {
  label: string
  url: string
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
]

export function ControlPanel() {
  const { controller } = useSimulation()
  const isRunning = useSimulationRunning()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedUrl, setSelectedUrl] = useState<string>(SCENARIO_OPTIONS[0].url)

  const handleLoadScenario = async () => {
    setLoading(true)
    setError(null)
    try {
      await controller.loadScenarioFromUrl(selectedUrl)
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
    </section>
  )
}
