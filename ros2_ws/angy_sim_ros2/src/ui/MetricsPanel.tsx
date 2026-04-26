import { useSimulation, useSimulationTime } from '../app/useSimulation'

export function MetricsPanel() {
  const { engine } = useSimulation()
  // Re-render on each tick so metrics stay current. Direct read from
  // `engine.state.metrics` rather than copying through React state to
  // avoid extra allocations.
  useSimulationTime()
  const m = engine.state.metrics
  const scenarioName = engine.state.scenarioName

  return (
    <section className="panel metrics-panel">
      <h2>Metrics</h2>
      <dl className="metrics">
        <div>
          <dt>Scenario</dt>
          <dd>{scenarioName ?? '—'}</dd>
        </div>
        <div>
          <dt>Ticks</dt>
          <dd>{m.ticks}</dd>
        </div>
        <div>
          <dt>Total distance</dt>
          <dd>{m.totalDistance.toFixed(2)} m</dd>
        </div>
        <div>
          <dt>Peak speed</dt>
          <dd>{m.peakSpeed.toFixed(2)} m/s</dd>
        </div>
        <div>
          <dt>Collisions</dt>
          <dd>{m.collisionCount}</dd>
        </div>
      </dl>
    </section>
  )
}
