import type { SimulationState } from '../core/SimulationState'

/**
 * Render-target abstraction. Implementations (Three.js, Phaser, Pixi,
 * Canvas2D, WebGPU, …) live OUTSIDE the simulation core. The core
 * never imports any rendering library.
 *
 * Lifecycle:
 *   1. `init(state)` — set up scene graph / camera / DOM mount, etc.
 *   2. `render(state)` — draw the current state. Called as often as
 *      the host UI wants (each tick, each animation frame, on demand).
 *   3. `dispose()` — release GPU resources, listeners, DOM nodes.
 *
 * The renderer is a *consumer* of state: it must not mutate entities
 * or fire engine events. To drive visuals from sim events, subscribe
 * via `state.events`.
 */
export interface SimulationRenderer {
  init(state: SimulationState): void | Promise<void>
  render(state: SimulationState): void
  dispose(): void
}
