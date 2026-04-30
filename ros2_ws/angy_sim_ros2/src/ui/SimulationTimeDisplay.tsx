import { useSimulationTime } from '../app/useSimulation'

/**
 * Inline simulation-time readout. No wrapping `<section>` or heading
 * so the host card decides where the value sits and how it's labeled.
 *
 * Used by `SimulationControlPanel` to show the running clock alongside
 * the Start/Pause/Step/Reset controls.
 */
export function SimulationTimeDisplay() {
  const t = useSimulationTime()
  return <span className="time-value">{t.toFixed(3)} s</span>
}
