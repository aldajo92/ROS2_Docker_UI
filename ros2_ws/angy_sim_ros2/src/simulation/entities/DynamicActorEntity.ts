import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'
import { Vector2D } from '../../math/geometry/Vector2D'
import { wrapAngle } from '../../math/geometry/operations2D'
import type { SimulationState } from '../core/SimulationState'
import { BaseEntity } from './BaseEntity'

export interface DynamicActorEntityOptions {
  id: string
  pose?: Pose2D
  /** World-frame linear velocity (m/s). */
  velocity?: Vector2D
  /** Angular rate (rad/s). */
  angularVelocity?: number
  radius?: number
}

/**
 * Holonomic moving obstacle: world-frame velocity is integrated
 * directly. Useful for "pedestrians", scripted traffic, or anything
 * that doesn't follow a vehicle kinematic constraint.
 */
export class DynamicActorEntity extends BaseEntity {
  pose: Pose2D
  velocity: Vector2D
  angularVelocity: number
  readonly radius: number

  constructor(options: DynamicActorEntityOptions) {
    super(options.id, 'dynamic_actor')
    this.pose = options.pose ?? Pose2D.identity()
    this.velocity = options.velocity ?? Vector2D.zero()
    this.angularVelocity = options.angularVelocity ?? 0
    this.radius = options.radius ?? 0.3
  }

  override update(dt: number, _state: SimulationState): void {
    const newX = this.pose.position.x + this.velocity.x * dt
    const newY = this.pose.position.y + this.velocity.y * dt
    const newYaw = wrapAngle(this.pose.yaw + this.angularVelocity * dt)
    this.pose = new Pose2D(new Point2D(newX, newY), newYaw)
  }
}
