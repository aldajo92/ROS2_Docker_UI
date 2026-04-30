import { useSimulation, useSimulationRunning } from '../app/useSimulation'
import { SimulationTimeDisplay } from './SimulationTimeDisplay'

/**
 * Top-level simulation card for the Inspector. It owns only UI wiring:
 * time readout plus direct calls to the existing controller controls.
 */
export function SimulationControlPanel() {
  const { controller } = useSimulation()
  const isRunning = useSimulationRunning()

  return (
    <section className="panel simulation-control-panel" aria-label="Simulation">
      <h2>Simulation Time</h2>
      <div className="simulation-time-row">
        <SimulationTimeDisplay />
      </div>
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
    </section>
  )
}
