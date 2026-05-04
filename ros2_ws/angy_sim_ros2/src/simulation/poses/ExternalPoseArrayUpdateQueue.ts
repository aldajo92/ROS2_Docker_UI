import type { PoseArray2D } from './PoseArray2D'

export type ExternalPoseArrayUpdate =
  | { readonly kind: 'upsert'; readonly poseArray: PoseArray2D }
  | { readonly kind: 'remove'; readonly id: string }

/**
 * Mailbox for pose-array mutations produced by external transports.
 * Follows the same coalescing pattern as {@link ExternalPathUpdateQueue}:
 * only the latest update per `id` is kept between drains.
 */
export class ExternalPoseArrayUpdateQueue {
  private readonly pending = new Map<string, ExternalPoseArrayUpdate>()

  enqueueUpsert(poseArray: PoseArray2D): void {
    if (typeof poseArray?.id !== 'string' || poseArray.id.length === 0) {
      throw new Error(
        'ExternalPoseArrayUpdateQueue.enqueueUpsert: poseArray.id must be a non-empty string',
      )
    }
    this.pending.delete(poseArray.id)
    this.pending.set(poseArray.id, { kind: 'upsert', poseArray })
  }

  enqueueRemove(id: string): void {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(
        'ExternalPoseArrayUpdateQueue.enqueueRemove: id must be a non-empty string',
      )
    }
    this.pending.delete(id)
    this.pending.set(id, { kind: 'remove', id })
  }

  hasPending(): boolean {
    return this.pending.size > 0
  }

  drain(): ExternalPoseArrayUpdate[] {
    if (this.pending.size === 0) return []
    const out = Array.from(this.pending.values())
    this.pending.clear()
    return out
  }

  clear(): void {
    this.pending.clear()
  }
}
