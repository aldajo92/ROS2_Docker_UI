import type { Entity } from './Entity'
import type { SimulationState } from '../core/SimulationState'

/**
 * Shared base: holds id/type and provides a no-op default update.
 * Subclasses override `update` if they need per-tick behavior.
 */
export abstract class BaseEntity implements Entity {
  readonly id: string
  readonly type: string

  constructor(id: string, type: string) {
    this.id = id
    this.type = type
  }

  update(_dt: number, _state: SimulationState): void {
    // intentional no-op
  }
}
