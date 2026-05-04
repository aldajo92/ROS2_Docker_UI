import type { SimulationState } from '../core/SimulationState'
import type { ExternalPoseArrayUpdateQueue } from '../poses/ExternalPoseArrayUpdateQueue'
import type { SimulationSystem } from './SimulationSystem'

/**
 * Drains the {@link ExternalPoseArrayUpdateQueue} into `state.poseArrays`
 * once per tick. Mirrors the pattern of {@link ExternalPathRenderSystem}.
 */
export class ExternalPoseArrayRenderSystem implements SimulationSystem {
  public readonly name = 'ExternalPoseArrayRenderSystem'
  private readonly queue: ExternalPoseArrayUpdateQueue

  constructor(queue: ExternalPoseArrayUpdateQueue) {
    this.queue = queue
  }

  update(_dt: number, state: SimulationState): void {
    if (!this.queue.hasPending()) return
    for (const update of this.queue.drain()) {
      if (update.kind === 'upsert') {
        state.poseArrays.upsert(update.poseArray)
      } else {
        state.poseArrays.remove(update.id)
      }
    }
  }

  reset(): void {
    this.queue.clear()
  }
}
