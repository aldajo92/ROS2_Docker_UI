import type RAPIER from '@dimforge/rapier2d-compat'
import type { CollisionShape2D } from '../../../simulation/collision/CollisionShape2D'

/**
 * Build a Rapier 2D `ColliderDesc` for one of our internal collision
 * shapes. This is the ONLY place where the simulation's shape DSL is
 * translated to Rapier; the backend is otherwise free to evolve its
 * world / body management without touching this mapper.
 *
 * Coordinate convention: simulation X/Y maps directly to Rapier 2D
 * X/Y. `length` (along simulation +Y) and `width` (along +X) become
 * Rapier `cuboid(hx, hy)` half-extents (hx along Rapier X, hy along Y).
 *
 * Position and rotation are NOT set on the desc here — they belong on
 * the parent `RigidBodyDesc`. Splitting this responsibility keeps the
 * mapper trivially testable.
 */
export function createRapierColliderDesc2D(
  rapier: typeof RAPIER,
  shape: CollisionShape2D,
): RAPIER.ColliderDesc {
  let desc: RAPIER.ColliderDesc
  if (shape.type === 'circle') {
    desc = rapier.ColliderDesc.ball(shape.radius)
  } else {
    // hx → simulation +X (width), hy → simulation +Y (length).
    desc = rapier.ColliderDesc.cuboid(shape.width / 2, shape.length / 2)
  }
  if (shape.isSensor) desc.setSensor(true)
  return desc
}
