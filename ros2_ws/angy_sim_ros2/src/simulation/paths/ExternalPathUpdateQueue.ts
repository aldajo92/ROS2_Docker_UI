import type { Path2D } from './Path2D'

/**
 * One pending mutation against `state.paths`, produced by an external
 * (transport-side) source and waiting to be applied during the next
 * tick.
 *
 * Why a queue and not direct `state.paths.add(...)`?
 *   - Rosbridge / WebSocket / DDS callbacks fire on the network layer
 *     thread (logically — JS is single-threaded but conceptually they
 *     are NOT inside a tick). The simulation core's invariant is that
 *     `SimulationState` is only mutated by systems during
 *     `engine.update()`. Letting an arbitrary external callback edit
 *     entities would break determinism, recording, and replay.
 *   - The queue is a one-frame handoff: enqueue at any time → drain
 *     during the next tick by `ExternalPathRenderSystem`.
 */
export type ExternalPathUpdate =
  | { readonly kind: 'upsert'; readonly path: Path2D }
  | { readonly kind: 'remove'; readonly id: string }

/**
 * Mailbox for path updates produced by external transports (rosbridge,
 * etc.) that should land in `state.paths` during the next tick.
 *
 * Coalescing semantics: only the *latest* update per `id` is kept
 * between drains. A remove for the same id supersedes a prior upsert
 * (and vice-versa) — the consumer only ever sees the final intent for
 * each id, in insertion order of the latest entry.
 *
 * The queue is intentionally NOT a `SimulationSystem` itself. The
 * draining logic lives in `ExternalPathRenderSystem`, which is the
 * only place allowed to write into `state.paths` from external data.
 */
export class ExternalPathUpdateQueue {
  // Map keyed by path id. Map preserves insertion order; we re-insert
  // on every enqueue so the most-recent ids appear last in `drain()`.
  private readonly pending = new Map<string, ExternalPathUpdate>()

  enqueueUpsert(path: Path2D): void {
    if (typeof path?.id !== 'string' || path.id.length === 0) {
      throw new Error(
        'ExternalPathUpdateQueue.enqueueUpsert: path.id must be a non-empty string',
      )
    }
    this.pending.delete(path.id)
    this.pending.set(path.id, { kind: 'upsert', path })
  }

  enqueueRemove(id: string): void {
    if (typeof id !== 'string' || id.length === 0) {
      throw new Error(
        'ExternalPathUpdateQueue.enqueueRemove: id must be a non-empty string',
      )
    }
    this.pending.delete(id)
    this.pending.set(id, { kind: 'remove', id })
  }

  /** `true` when there is at least one pending update. Cheap. */
  hasPending(): boolean {
    return this.pending.size > 0
  }

  /**
   * Return all pending updates and clear the queue. Returned in
   * Map-iteration order (i.e. last enqueue wins, insertion order is
   * the order in which each *id* was last touched).
   */
  drain(): ExternalPathUpdate[] {
    if (this.pending.size === 0) return []
    const out = Array.from(this.pending.values())
    this.pending.clear()
    return out
  }

  /**
   * Drop every pending update without applying it. Used by
   * implementations on transport teardown so a stale enqueue can't
   * leak into the next connect.
   */
  clear(): void {
    this.pending.clear()
  }
}
