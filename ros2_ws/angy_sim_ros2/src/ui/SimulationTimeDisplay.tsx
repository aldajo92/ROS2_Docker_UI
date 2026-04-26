import { useSimulationTime } from '../app/useSimulation'

export function SimulationTimeDisplay() {
  const t = useSimulationTime()
  return (
    <section className="panel time-panel">
      <h2>Simulation Time</h2>
      <p className="time-value">{t.toFixed(3)} s</p>
    </section>
  )
}
