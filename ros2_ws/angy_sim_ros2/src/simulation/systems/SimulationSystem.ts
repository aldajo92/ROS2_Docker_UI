import type { SimulationState } from '../core/SimulationState'

/**
 * Contract every system implements. Systems are the "behavior" layer:
 * they read/write entity state and emit events. Run order follows the
 * order they were added to the SystemManager.
 *
 * `reset` is invoked by the engine on `engine.reset()` (after entities
 * are cleared). Systems with internal state — caches, contact pair
 * sets, accumulators — should clear it here. `dispose` is reserved
 * for releasing external resources (e.g. WASM memory) on shutdown.
 * Both are optional: stateless systems leave them off.
 */
export interface SimulationSystem {
  readonly name: string
  update(dt: number, state: SimulationState): void
  reset?(): void
  dispose?(): void
}
