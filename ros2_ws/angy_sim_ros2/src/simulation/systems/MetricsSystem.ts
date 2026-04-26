import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'

/**
 * Reserved for cross-cutting metrics that don't belong to any single
 * other system. Today there's nothing to do here — counts and totals
 * are accumulated in the systems that already touch the relevant
 * entities (VehicleDynamicsSystem, CollisionSystem). Kept as a real
 * system so future derived metrics (e.g. moving averages, scoring)
 * have an obvious home.
 */
export class MetricsSystem implements SimulationSystem {
  readonly name = 'metrics'

  update(_dt: number, _state: SimulationState): void {
    // intentional no-op
  }
}
