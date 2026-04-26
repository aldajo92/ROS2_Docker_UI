import type { SimulationState } from '../core/SimulationState'

/**
 * Contract every system implements. Systems are the "behavior" layer:
 * they read/write entity state and emit events. Run order follows the
 * order they were added to the SystemManager.
 */
export interface SimulationSystem {
  readonly name: string
  update(dt: number, state: SimulationState): void
}
