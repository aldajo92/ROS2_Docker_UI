import { describe, expect, it } from 'vitest'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'
import { Vector2D } from '../../math/geometry/Vector2D'
import { BaseEntity } from '../entities/BaseEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { VehicleEntity } from '../entities/VehicleEntity'
import { getEntityTrajectoryPose2D } from './getEntityTrajectoryPose2D'

describe('getEntityTrajectoryPose2D', () => {
  it('extracts vehicle pose', () => {
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(1, 2, 0.25),
      controls: { v: 1.7, w: 0 },
    })
    vehicle.v = 1.7

    expect(getEntityTrajectoryPose2D(vehicle)).toEqual({
      x: 1,
      y: 2,
      yaw: 0.25,
      speed: 1.7,
    })
  })

  it('extracts dynamic actor pose', () => {
    const actor = new DynamicActorEntity({
      id: 'actor',
      pose: Pose2D.of(4, 5, -0.5),
      velocity: new Vector2D(3, 4),
      angularVelocity: 0.1,
    })

    expect(getEntityTrajectoryPose2D(actor)).toEqual({
      x: 4,
      y: 5,
      yaw: -0.5,
      speed: 5,
    })
  })

  it('returns undefined for static obstacles', () => {
    const obstacle = new StaticObstacleEntity({
      id: 'obs',
      position: new Point2D(10, 11),
      radius: 0.5,
    })
    expect(getEntityTrajectoryPose2D(obstacle)).toBeUndefined()
  })

  it('returns undefined for unsupported entities', () => {
    class UnknownEntity extends BaseEntity {
      constructor() {
        super('u1', 'unknown')
      }
    }
    expect(getEntityTrajectoryPose2D(new UnknownEntity())).toBeUndefined()
  })
})
