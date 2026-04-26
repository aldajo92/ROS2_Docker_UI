import type { CollisionShape2D } from './CollisionShape2D'
import type { CollisionContact2D } from './CollisionContact2D'

/**
 * Pluggable 2D collision detector. Implementations must be free of
 * any framework dependency that pollutes `src/simulation` (no Rapier,
 * no Three.js, no DOM). Concrete heavy backends — Rapier, Matter.js,
 * spatial hashes — live under `src/infrastructure/collision/...` and
 * implement this interface from outside the core.
 *
 * Contract:
 *   - `detect` is pure: it MUST NOT mutate the input array or its
 *     shape objects, and SHOULD be deterministic for a given input
 *     (callers rely on stable pair ordering for events / counters).
 *   - `reset` clears any backend-internal cache; called when the
 *     simulation is reset / a new scenario is loaded.
 *   - `dispose` releases backend resources (e.g. Rapier WASM memory).
 *
 * Every emitted `CollisionContact2D.entityAId` / `entityBId` MUST
 * correspond to an `entityId` from one of the input shapes; backends
 * do not invent ids.
 */
export interface CollisionBackend2D {
  readonly name: string

  detect(shapes: readonly CollisionShape2D[]): CollisionContact2D[]

  reset?(): void
  dispose?(): void
}
