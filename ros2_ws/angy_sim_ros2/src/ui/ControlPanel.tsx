import { useState } from 'react'
import { useSimulation, useSimulationRunning } from '../app/useSimulation'

const DEFAULT_SCENARIO_URL = '/scenarios/simple-scenario.json'

export function ControlPanel() {
  const { controller } = useSimulation()
  const isRunning = useSimulationRunning()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLoadScenario = async () => {
    setLoading(true)
    setError(null)
    try {
      await controller.loadScenarioFromUrl(DEFAULT_SCENARIO_URL)
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
        <button onClick={handleLoadScenario} disabled={loading}>
          {loading ? 'Loading…' : 'Load Scenario'}
        </button>
      </div>
      {error && <p className="error">Failed to load scenario: {error}</p>}
    </section>
  )
}
