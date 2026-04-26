import type { CollisionBackend2D } from './CollisionBackend2D'
import type {
  CircleCollisionShape2D,
  CollisionShape2D,
} from './CollisionShape2D'
import type { CollisionContact2D } from './CollisionContact2D'

/**
 * Default backend. O(n²) circle-vs-circle in the simulation X/Y plane.
 *
 * Trade-off: simple, dependency-free, deterministic, and good enough
 * for ≲100 entities. For larger scenes swap in a backend with
 * broad-phase pruning (e.g. `RapierCollisionBackend2D`) — the contract
 * doesn't change.
 *
 * Non-circle shapes (oriented boxes) are silently ignored here. If
 * you need them and you're using this backend, add a circle
 * approximation when building shapes. A real circle-vs-OBB test
 * belongs in a richer backend.
 */
export class SimpleCircleCollisionBackend2D implements CollisionBackend2D {
  readonly name = 'SimpleCircleCollisionBackend2D'

  detect(shapes: readonly CollisionShape2D[]): CollisionContact2D[] {
    const circles: CircleCollisionShape2D[] = []
    for (const shape of shapes) {
      if (shape.type === 'circle') circles.push(shape)
    }

    const contacts: CollisionContact2D[] = []

    for (let i = 0; i < circles.length; i++) {
      const a = circles[i]
      for (let j = i + 1; j < circles.length; j++) {
        const b = circles[j]

        const dx = b.center.x - a.center.x
        const dy = b.center.y - a.center.y
        const radiusSum = a.radius + b.radius
        const distanceSq = dx * dx + dy * dy
        const radiusSumSq = radiusSum * radiusSum

        if (distanceSq > radiusSumSq) continue

        const distance = Math.sqrt(distanceSq)
        // Coincident centers: pick an arbitrary but stable normal so
        // downstream consumers don't get NaN.
        const normal =
          distance > 1e-9
            ? { x: dx / distance, y: dy / distance }
            : { x: 1, y: 0 }

        contacts.push({
          entityAId: a.entityId,
          entityBId: b.entityId,
          normal,
          penetrationDepth: Math.max(0, radiusSum - distance),
        })
      }
    }

    return contacts
  }
}
