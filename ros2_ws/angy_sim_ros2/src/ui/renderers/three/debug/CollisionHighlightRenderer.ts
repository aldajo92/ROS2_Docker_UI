import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Placeholder for collision feedback. The real version will subscribe
 * to the engine's `collision` event and pulse a colored ring around
 * each impacted entity for a short window of sim time. We don't wire
 * that yet because we don't have a renderer-side animation clock —
 * adding one for a single effect is overkill, so this stays a no-op
 * until the next visual-effects pass.
 *
 * The class still exists as a typed slot in `ThreeDebugLayer` so
 * downstream toggles (`config.showDebug`) flip a real renderer when
 * one lands.
 */
export class CollisionHighlightRenderer {
  private readonly context: ThreeSceneContext

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(_state: SimulationState): void {
    // Intentionally empty.
  }

  dispose(): void {
    void this.context
  }
}
