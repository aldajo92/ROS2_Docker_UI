import type { SimulationState } from '../core/SimulationState'
import type { CollisionShape2D } from './CollisionShape2D'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'

/**
 * Snapshot the X/Y collision shapes of every entity currently in the
 * simulation. Pure read of `SimulationState`: never mutates entities,
 * never imports Rapier or Three.js.
 *
 * Mapping today (everything is a circle):
 *   - VehicleEntity        → circle at `pose.position`, radius `vehicle.radius`
 *   - StaticObstacleEntity → circle at `position`,      radius `obstacle.radius`
 *   - DynamicActorEntity   → circle at `pose.position`, radius `actor.radius`
 *
 * Future shape choices (oriented box for vehicles, AABB for axis-aligned
 * obstacles, etc.) belong here — backends downstream just consume the
 * resulting `CollisionShape2D[]`.
 *
 * Iteration order follows `EntityManager.toArray()` which is insertion
 * order, so results are deterministic for a given scenario.
 *
 * NOTE: The simulation +Z axis is intentionally ignored — collision is
 * 2D only.
 */
export function buildCollisionShapes2DFromState(
  state: SimulationState,
): CollisionShape2D[] {
  const shapes: CollisionShape2D[] = []

  for (const entity of state.entities.toArray()) {
    if (entity instanceof VehicleEntity) {
      shapes.push({
        type: 'circle',
        entityId: entity.id,
        center: { x: entity.pose.position.x, y: entity.pose.position.y },
        radius: entity.radius,
      })
      continue
    }

    if (entity instanceof StaticObstacleEntity) {
      shapes.push({
        type: 'circle',
        entityId: entity.id,
        center: { x: entity.position.x, y: entity.position.y },
        radius: entity.radius,
      })
      continue
    }

    if (entity instanceof DynamicActorEntity) {
      shapes.push({
        type: 'circle',
        entityId: entity.id,
        center: { x: entity.pose.position.x, y: entity.pose.position.y },
        radius: entity.radius,
      })
      continue
    }
  }

  return shapes
}
