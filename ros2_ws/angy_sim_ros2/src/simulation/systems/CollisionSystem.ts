import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'
import type { CollisionBackend2D } from '../collision/CollisionBackend2D'
import { buildCollisionShapes2DFromState } from '../collision/buildCollisionShapes2DFromState'
import { collisionPairKey } from '../collision/CollisionPairKey'

/**
 * Orchestrator. Does NOT implement the collision algorithm — it
 * delegates to a pluggable `CollisionBackend2D`. Responsibilities:
 *
 *   1. Snapshot 2D shapes from `SimulationState`.
 *   2. Ask the backend for current contacts.
 *   3. Diff against the previous tick to detect leading-edge pairs.
 *   4. Bump `metrics.collisionCount` and emit `collision` once per
 *      *new* pair (steady contact does not re-fire).
 *   5. Drop pairs that are no longer in contact so they're eligible
 *      to fire again on re-contact.
 *
 * Architectural rules enforced here:
 *   - No imports from Rapier, Three.js, or `infrastructure/...`.
 *   - The simulation state remains the source of truth for poses;
 *     the backend may build internal structures but must not be
 *     allowed to mutate entities. (See `CollisionBackend2D`'s
 *     "do not mutate" contract.)
 */
export class CollisionSystem implements SimulationSystem {
  readonly name = 'collision'

  private readonly backend: CollisionBackend2D
  private active = new Set<string>()

  constructor(backend: CollisionBackend2D) {
    this.backend = backend
  }

  update(_dt: number, state: SimulationState): void {
    const shapes = buildCollisionShapes2DFromState(state)
    const contacts = this.backend.detect(shapes)

    const next = new Set<string>()

    for (const contact of contacts) {
      const key = collisionPairKey(contact.entityAId, contact.entityBId)
      if (next.has(key)) continue // backend reported same pair twice; ignore.
      next.add(key)

      if (this.active.has(key)) continue // ongoing contact, no event.

      // Leading edge: orient the pair the same way the key does so
      // event consumers see a stable (a, b) ordering.
      const aFirst = contact.entityAId < contact.entityBId
      const a = aFirst ? contact.entityAId : contact.entityBId
      const b = aFirst ? contact.entityBId : contact.entityAId
      const normal =
        contact.normal && !aFirst
          ? { x: -contact.normal.x, y: -contact.normal.y }
          : contact.normal

      state.metrics.collisionCount += 1
      state.events.emit('collision', {
        a,
        b,
        time: state.clock.time(),
        normal,
        penetrationDepth: contact.penetrationDepth,
      })
    }

    this.active = next
  }

  reset(): void {
    this.active.clear()
    this.backend.reset?.()
  }

  dispose(): void {
    this.active.clear()
    this.backend.dispose?.()
  }
}
