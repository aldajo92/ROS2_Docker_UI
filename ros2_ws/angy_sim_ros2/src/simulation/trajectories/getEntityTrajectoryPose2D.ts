import type { Entity } from '../entities/Entity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { VehicleEntity } from '../entities/VehicleEntity'

export type TrajectoryPose2D = {
  x: number
  y: number
  yaw?: number
  speed?: number
}

export function getEntityTrajectoryPose2D(
  entity: Entity,
): TrajectoryPose2D | undefined {
  if (entity instanceof VehicleEntity) {
    return {
      x: entity.pose.position.x,
      y: entity.pose.position.y,
      yaw: entity.pose.yaw,
      speed: Math.abs(entity.v),
    }
  }

  if (entity instanceof DynamicActorEntity) {
    return {
      x: entity.pose.position.x,
      y: entity.pose.position.y,
      yaw: entity.pose.yaw,
      speed: Math.hypot(entity.velocity.x, entity.velocity.y),
    }
  }

  return undefined
}
