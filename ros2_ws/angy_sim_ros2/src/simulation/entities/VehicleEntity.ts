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

/**
 * Entity-local command shape — the form that lands on a single
 * `VehicleEntity` via `setCommand`. Fields are partial; only those
 * present on the call are applied (the rest keep their previous
 * commanded value).
 *
 * This type is distinct from `VehicleCommand` in
 * `simulation/commands/VehicleCommand.ts`, which is the **addressed**
 * command (carries `vehicleId`, `source`, `timestampSec`) flowing
 * through `VehicleCommandQueue`. `VehicleCommandSystem` consumes the
 * addressed form and translates it into this entity-local form before
 * calling `setCommand`.
 *
 * The unicycle model reads `linearVelocity` / `angularVelocity`;
 * `throttle` / `brake` / `steering` are accepted for forward
 * compatibility with bicycle / Ackermann models but ignored by the
 * default integrator.
 */
export interface AppliedVehicleCommand {
  /** Commanded forward speed, m/s. Maps to `controls.v` for unicycles. */
  linearVelocity?: number
  /** Commanded angular rate, rad/s (CCW positive). Maps to `controls.w`. */
  angularVelocity?: number
  /** Future use — bicycle / Ackermann models. Ignored by unicycles. */
  throttle?: number
  brake?: number
  steering?: number
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

  /**
   * Apply a high-level command. Sticky semantics: only fields present
   * on the call are touched; everything else is left at the previously
   * commanded value. This is what lets external bridges send partial
   * commands (e.g. just a steering angle) without zeroing the rest.
   *
   * Callers that want "release-to-stop" behavior (keyboard, joystick)
   * must therefore send explicit numeric `linearVelocity` /
   * `angularVelocity` every tick — `0` when no input is active. That's
   * exactly what `KeyboardVehicleCommandMapper` does.
   *
   * For the unicycle model, this is a thin mapping:
   *
   *   linearVelocity  → controls.v
   *   angularVelocity → controls.w
   *
   * `throttle` / `brake` / `steering` are intentionally ignored here so
   * external callers can keep using a single canonical command shape;
   * a richer kinematic model (bicycle, Ackermann) can override this
   * method to consume them.
   */
  setCommand(command: AppliedVehicleCommand): void {
    const next: VehicleControls = { v: this.controls.v, w: this.controls.w }
    if (command.linearVelocity !== undefined) next.v = command.linearVelocity
    if (command.angularVelocity !== undefined) next.w = command.angularVelocity
    this.controls = next
  }

  /** Read the currently-commanded controls (read-only snapshot). */
  getControls(): Readonly<VehicleControls> {
    return { v: this.controls.v, w: this.controls.w }
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
