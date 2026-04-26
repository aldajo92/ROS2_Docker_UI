import RAPIER from '@dimforge/rapier2d-compat'
import type { CollisionBackend2D } from '../../../simulation/collision/CollisionBackend2D'
import type { CollisionShape2D } from '../../../simulation/collision/CollisionShape2D'
import type { CollisionContact2D } from '../../../simulation/collision/CollisionContact2D'
import { createRapierColliderDesc2D } from './RapierShapeMapper2D'

/**
 * Optional 2D collision backend powered by Rapier 2D
 * (`@dimforge/rapier2d-compat`).
 *
 * Phase 1 strategy (intentionally simple, NOT optimized):
 *   - On every `detect()` call, build a fresh zero-gravity `World`,
 *     create one fixed rigid body per input shape, attach a collider
 *     for that shape, step once, enumerate contact pairs, free.
 *
 * That's wasteful but it gives us a 100% stateless backend that
 * produces the exact same contract `SimpleCircleCollisionBackend2D`
 * does, so it can be swapped in transparently.
 *
 * Phase 2+ TODOs (do NOT implement now):
 *   - Cache the Rapier `World` and reuse colliders between frames;
 *     diff against `state` for entity add/remove and update body
 *     translations / rotations in place.
 *   - Use Rapier's broad-phase to prune candidate pairs.
 *   - Drive vehicle dynamics from Rapier rigid bodies (currently the
 *     simulation state remains the source of truth for poses).
 *   - Sync rigid-body poses back into entities.
 *   - Sensors / triggers that fire `intersectionPair` events.
 *   - Hoist Rapier into a WebWorker.
 *   - 3D collision via Rapier 3D for ramps / volumetric scenarios.
 *
 * Architectural rules:
 *   - This file lives in `infrastructure/`, the only layer allowed
 *     to import Rapier.
 *   - The `simulation/collision/CollisionBackend2D` contract is the
 *     boundary: nothing else in the simulator should know this
 *     backend exists.
 */
export class RapierCollisionBackend2D implements CollisionBackend2D {
  readonly name = 'RapierCollisionBackend2D'
  private readonly rapier: typeof RAPIER

  private constructor(rapier: typeof RAPIER) {
    this.rapier = rapier
  }

  /**
   * Async constructor — Rapier compat ships its WASM as inline base64
   * but still requires a one-shot `init()` before any class is usable.
   * Calling `create()` more than once is safe; `RAPIER.init()` is
   * idempotent.
   */
  static async create(): Promise<RapierCollisionBackend2D> {
    await RAPIER.init()
    return new RapierCollisionBackend2D(RAPIER)
  }

  detect(shapes: readonly CollisionShape2D[]): CollisionContact2D[] {
    if (shapes.length === 0) return []

    const rapier = this.rapier
    const world = new rapier.World({ x: 0, y: 0 })
    // Sub-step the integrator as little as possible: we only care
    // about contact discovery, not dynamics. A tiny timestep keeps
    // Rapier from generating motion that would invalidate contact
    // positions before we read them.
    world.timestep = 0
    const entityByColliderHandle = new Map<number, string>()

    try {
      for (const shape of shapes) {
        const bodyDesc = rapier.RigidBodyDesc.fixed()
        if (shape.type === 'circle') {
          bodyDesc.setTranslation(shape.center.x, shape.center.y)
        } else {
          bodyDesc.setTranslation(shape.pose.x, shape.pose.y)
          bodyDesc.setRotation(shape.pose.yaw)
        }
        const body = world.createRigidBody(bodyDesc)
        const colliderDesc = createRapierColliderDesc2D(rapier, shape)
        const collider = world.createCollider(colliderDesc, body)
        entityByColliderHandle.set(collider.handle, shape.entityId)
      }

      // One step is enough to populate the narrow phase. With
      // `timestep = 0` and zero gravity, no body actually moves.
      world.step()

      const contacts: CollisionContact2D[] = []
      const visitedPairs = new Set<string>()

      world.forEachCollider((colliderA) => {
        const entityAId = entityByColliderHandle.get(colliderA.handle)
        if (!entityAId) return

        world.contactPairsWith(colliderA, (colliderB) => {
          const entityBId = entityByColliderHandle.get(colliderB.handle)
          if (!entityBId) return
          if (entityAId === entityBId) return

          // contactPairsWith yields each pair from both sides — dedupe.
          const handleA = colliderA.handle
          const handleB = colliderB.handle
          const lo = handleA < handleB ? handleA : handleB
          const hi = handleA < handleB ? handleB : handleA
          const key = `${lo}|${hi}`
          if (visitedPairs.has(key)) return
          visitedPairs.add(key)

          // Extract a normal + penetration depth from the deepest
          // manifold contact, if available. Rapier's manifold normal
          // points from `colliderA` outward; positive penetration is
          // reported as a NEGATIVE `contactDist` (the bodies overlap
          // by that much), so we flip the sign.
          let normal: { x: number; y: number } | undefined
          let penetrationDepth: number | undefined

          world.contactPair(colliderA, colliderB, (manifold, flipped) => {
            const numContacts = manifold.numContacts()
            if (numContacts === 0) return

            let deepestDist = manifold.contactDist(0)
            for (let i = 1; i < numContacts; i++) {
              const d = manifold.contactDist(i)
              if (d < deepestDist) deepestDist = d
            }

            if (deepestDist <= 0) {
              penetrationDepth = -deepestDist
            }

            const n = manifold.normal()
            // When `flipped` is true, the manifold's "side 1" is
            // actually `colliderB`, so the normal points B → A; flip
            // it so the contract (A → B) is preserved.
            const sign = flipped ? -1 : 1
            normal = { x: n.x * sign, y: n.y * sign }
          })

          contacts.push({
            entityAId,
            entityBId,
            normal,
            penetrationDepth,
          })
        })
      })

      return contacts
    } finally {
      world.free()
    }
  }

  reset(): void {
    // Stateless across calls in Phase 1 — nothing to clear.
    // Phase 2 (cached world) will release/recreate the world here.
  }

  dispose(): void {
    // Stateless across calls in Phase 1 — `detect()` already frees
    // its temporary world. Phase 2 will free the cached world here.
  }
}
