import type { CollisionBackend2D } from './CollisionBackend2D'
import type { CollisionShape2D } from './CollisionShape2D'
import type { CollisionContact2D } from './CollisionContact2D'

/**
 * No-op backend used when collisions are explicitly disabled
 * (`CollisionConfig.backend === 'disabled'`).
 *
 * Why this exists rather than skipping `CollisionSystem` entirely:
 * keeping the tick pipeline shape identical regardless of config makes
 * tests, replays, and metric counters comparable across backends. The
 * cost of going through `CollisionSystem.update -> backend.detect ->
 * []` is one allocation-free function call.
 */
export class NoopCollisionBackend2D implements CollisionBackend2D {
  readonly name = 'NoopCollisionBackend2D'

  detect(_shapes: readonly CollisionShape2D[]): CollisionContact2D[] {
    return []
  }

  reset(): void {
    // no-op
  }

  dispose(): void {
    // no-op
  }
}
