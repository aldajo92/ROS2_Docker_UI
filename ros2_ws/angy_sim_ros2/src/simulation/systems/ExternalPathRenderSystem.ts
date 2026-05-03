import type { SimulationState } from '../core/SimulationState'
import type { ExternalPathUpdateQueue } from '../paths/ExternalPathUpdateQueue'
import type { SimulationSystem } from './SimulationSystem'

/**
 * Drains the {@link ExternalPathUpdateQueue} into `state.paths` once
 * per tick. This is the *only* code path that writes externally-sourced
 * paths into `SimulationState`, which preserves the architectural rule
 * that external (rosbridge / WebSocket / DDS) callbacks must never
 * mutate simulation state directly.
 *
 * Tick order: register this system AFTER the systems that consume
 * `state.paths` for control / dynamics decisions but BEFORE the
 * recorder, so a path published mid-tick lands in the next recorded
 * frame rather than skipping it.
 *
 * The system is renderer-agnostic — Three.js and Phaser already pull
 * from `state.paths` via their respective `*PathRenderer`s, so adding
 * an external path here is enough to make it appear in both views.
 */
export class ExternalPathRenderSystem implements SimulationSystem {
  public readonly name = 'ExternalPathRenderSystem'
  private readonly queue: ExternalPathUpdateQueue

  constructor(queue: ExternalPathUpdateQueue) {
    this.queue = queue
  }

  update(_dt: number, state: SimulationState): void {
    if (!this.queue.hasPending()) return
    const updates = this.queue.drain()
    for (const update of updates) {
      if (update.kind === 'upsert') {
        // PathRegistry.add is upsert (Map.set), so re-publishing the
        // same id with a new point list overwrites cleanly.
        state.paths.add(update.path)
      } else {
        state.paths.remove(update.id)
      }
    }
  }

  /** Drop any pending updates so `engine.reset()` starts clean. */
  reset(): void {
    this.queue.clear()
  }
}
