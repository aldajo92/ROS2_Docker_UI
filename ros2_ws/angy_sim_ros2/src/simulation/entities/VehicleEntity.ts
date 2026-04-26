import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'
import { wrapAngle } from '../../math/geometry/operations2D'
import type { SimulationState } from '../core/SimulationState'
import { BaseEntity } from './BaseEntity'

export interface VehicleControls {
  /** Commanded forward speed, m/s (along vehicle heading). */
  v: number
  /** Commanded angular rate, rad/s (CCW positive). */
  w: number
}

export interface VehicleEntityOptions {
  id: string
  pose?: Pose2D
  controls?: VehicleControls
  /** Bounding circle radius, in meters, used by collision checks. */
  radius?: number
}

/**
 * Differential-drive (unicycle) kinematic model.
 *
 *   yaw_{t+1} = yaw_t + w · dt
 *   x_{t+1}   = x_t   + v · cos(yaw_{t+1}) · dt
 *   y_{t+1}   = y_t   + v · sin(yaw_{t+1}) · dt
 *
 * Yaw integrates first so the heading used for translation matches
 * the heading at the end of the step (semi-implicit), which is the
 * conventional discretization for this model.
 */
export class VehicleEntity extends BaseEntity {
  pose: Pose2D
  controls: VehicleControls
  readonly radius: number

  /** Last applied longitudinal speed (m/s), exposed for telemetry. */
  v: number = 0
  /** Last applied angular rate (rad/s), exposed for telemetry. */
  w: number = 0
  /** Cumulative arc-length traveled (m). */
  distanceTraveled: number = 0

  constructor(options: VehicleEntityOptions) {
    super(options.id, 'vehicle')
    this.pose = options.pose ?? Pose2D.identity()
    this.controls = options.controls ?? { v: 0, w: 0 }
    this.radius = options.radius ?? 0.4
  }

  setControls(controls: VehicleControls): void {
    this.controls = controls
  }

  override update(dt: number, _state: SimulationState): void {
    const { v, w } = this.controls
    const newYaw = wrapAngle(this.pose.yaw + w * dt)
    const newX = this.pose.position.x + v * Math.cos(newYaw) * dt
    const newY = this.pose.position.y + v * Math.sin(newYaw) * dt
    this.distanceTraveled += Math.abs(v) * dt
    this.pose = new Pose2D(new Point2D(newX, newY), newYaw)
    this.v = v
    this.w = w
  }
}
