import type { SimulationState } from '../core/SimulationState'

/**
 * Common contract for everything tracked by the simulation. `update`
 * is invoked by a system (not directly by the engine) — inert objects
 * leave the default no-op in BaseEntity.
 */
export interface Entity {
  readonly id: string
  readonly type: string
  update(dt: number, state: SimulationState): void
}
