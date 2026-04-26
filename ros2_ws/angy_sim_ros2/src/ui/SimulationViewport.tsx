/**
 * Left-hand simulation view. The simulation core is rendering-agnostic
 * and the `SimulationRenderer` is interface-only, so we show a
 * placeholder until a concrete renderer is wired in.
 *
 * When a renderer is connected later, mount it inside `.viewport-stage`
 * and remove the placeholder.
 */
export function SimulationViewport() {
  return (
    <section className="panel viewport">
      <div className="viewport-header">
        <h2>Simulation View</h2>
      </div>
      <div
        className="viewport-stage"
        role="img"
        aria-label="Simulation viewport (no renderer connected)"
      >
        <p className="viewport-placeholder">No sim yet</p>
      </div>
    </section>
  )
}
