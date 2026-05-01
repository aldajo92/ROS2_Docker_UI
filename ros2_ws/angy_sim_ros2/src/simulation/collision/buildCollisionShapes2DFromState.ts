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
 * Mapping:
 *   - VehicleEntity        → circle at `pose.position`, radius `vehicle.radius`
 *   - StaticObstacleEntity → circle OR oriented_box depending on
 *                            `entity.shape.type`. Rectangular obstacles
 *                            emit `oriented_box` with
 *                            `length = shape.length` (local forward) and
 *                            `width = shape.thickness` (local lateral),
 *                            matching the `OrientedBoxCollisionShape2D`
 *                            convention.
 *   - DynamicActorEntity   → circle at `pose.position`, radius `actor.radius`
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
      if (entity.shape.type === 'circle') {
        shapes.push({
          type: 'circle',
          entityId: entity.id,
          center: { x: entity.position.x, y: entity.position.y },
          radius: entity.shape.radius,
        })
      } else {
        // The entity stores `length` along its local +X (the "heading"
        // direction implied by `yaw`) and `thickness` along local +Y.
        // `OrientedBoxCollisionShape2D`, by contract, stores `width`
        // along local +X and `length` along local +Y — the opposite.
        // Mapping:
        //   entity.length    (local +X) → OBB.width    (local +X)
        //   entity.thickness (local +Y) → OBB.length   (local +Y)
        //   entity.yaw → OBB.pose.yaw (same rotation semantics)
        shapes.push({
          type: 'oriented_box',
          entityId: entity.id,
          pose: {
            x: entity.position.x,
            y: entity.position.y,
            yaw: entity.shape.yaw,
          },
          length: entity.shape.thickness,
          width: entity.shape.length,
        })
      }
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
