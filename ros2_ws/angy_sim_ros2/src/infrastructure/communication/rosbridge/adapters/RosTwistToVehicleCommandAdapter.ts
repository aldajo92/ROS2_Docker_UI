import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'
import type { VehicleCommand } from '../../../../simulation/commands/VehicleCommand'
import type { RosTwistMessage } from '../RosMessageTypes'

export interface RosTwistToVehicleCommandAdapterOptions {
  /**
   * Vehicle that inbound `/cmd_vel` Twist messages are routed to.
   * `geometry_msgs/Twist` carries no addressing information, so the
   * routing decision lives at adapter-construction time. Use one
   * adapter per `(topic, vehicleId)` pair if you need to demultiplex.
   *
   * Defaults to `'ego'` to match the canonical scenario-vehicle id.
   */
  vehicleId?: string
  /**
   * Per-axis multipliers applied before the wire value reaches the
   * `VehicleCommand`. `v *= scale.v ?? 1`, `w *= scale.w ?? 1`. Useful
   * when the upstream publisher uses different units / sign
   * conventions (e.g. "stick units" → m/s).
   */
  scale?: {
    v?: number
    w?: number
  }
  /**
   * Optional clamps applied AFTER scaling, so a misbehaving publisher
   * can't drive a vehicle past its scenario-declared safe envelope.
   * Each value is a positive magnitude; positive `v` is clamped to
   * `maxForwardSpeed`, negative `v` to `-maxReverseSpeed`, and `|w|`
   * to `maxAngularSpeed`.
   */
  limits?: {
    maxForwardSpeed?: number
    maxReverseSpeed?: number
    maxAngularSpeed?: number
  }
}

const DEFAULT_VEHICLE_ID = 'ego'

/**
 * Adapter: `geometry_msgs/msg/Twist` ↔ `VehicleCommand`.
 *
 * Inbound (`toInternal`):
 *
 *   linear.x  → linearVelocity   (m/s along vehicle heading)
 *   angular.z → angularVelocity  (rad/s, CCW from +X)
 *
 * `linear.y`, `linear.z`, `angular.x`, `angular.y` are intentionally
 * ignored — the simulator's unicycle integrator has no use for them.
 * They are still validated to be finite numbers so a malformed
 * publisher fails loudly rather than corrupting state with `NaN`.
 *
 * `source` is forced to `'external'` because every Twist crossing this
 * adapter originates outside the simulator (`/cmd_vel` is by
 * convention a control input). `vehicleId` comes from the adapter's
 * constructor; `timestampSec` is left unset (Twist carries no header).
 *
 * Outbound (`fromInternal`):
 *
 *   linearVelocity?  → linear.x  (default 0)
 *   angularVelocity? → angular.z (default 0)
 *
 * All other fields are zeroed. The adapter is not lossless — it
 * deliberately drops sim-only fields (`throttle`, `brake`, `steering`,
 * `vehicleId`, `source`, `timestampSec`) because Twist has nowhere to
 * put them. Callers that need them must pick a richer message type.
 */
export class RosTwistToVehicleCommandAdapter
  implements MessageAdapter<unknown, VehicleCommand>
{
  private readonly vehicleId: string
  private readonly scaleV: number
  private readonly scaleW: number
  private readonly maxForwardSpeed?: number
  private readonly maxReverseSpeed?: number
  private readonly maxAngularSpeed?: number

  constructor(options: RosTwistToVehicleCommandAdapterOptions = {}) {
    const requested = options.vehicleId
    if (
      requested !== undefined &&
      (typeof requested !== 'string' || requested.length === 0)
    ) {
      throw new Error(
        'RosTwistToVehicleCommandAdapter: vehicleId, when provided, must be a non-empty string',
      )
    }
    this.vehicleId = requested ?? DEFAULT_VEHICLE_ID
    this.scaleV = validateFiniteNumber(
      options.scale?.v,
      'scale.v',
      1,
    )
    this.scaleW = validateFiniteNumber(
      options.scale?.w,
      'scale.w',
      1,
    )
    this.maxForwardSpeed = validatePositiveLimit(
      options.limits?.maxForwardSpeed,
      'limits.maxForwardSpeed',
    )
    this.maxReverseSpeed = validatePositiveLimit(
      options.limits?.maxReverseSpeed,
      'limits.maxReverseSpeed',
    )
    this.maxAngularSpeed = validatePositiveLimit(
      options.limits?.maxAngularSpeed,
      'limits.maxAngularSpeed',
    )
  }

  toInternal(message: unknown): VehicleCommand {
    const twist = assertTwist(message)

    let v = twist.linear.x * this.scaleV
    let w = twist.angular.z * this.scaleW
    if (this.maxForwardSpeed !== undefined && v > this.maxForwardSpeed) {
      v = this.maxForwardSpeed
    }
    if (this.maxReverseSpeed !== undefined && v < -this.maxReverseSpeed) {
      v = -this.maxReverseSpeed
    }
    if (this.maxAngularSpeed !== undefined) {
      if (w > this.maxAngularSpeed) w = this.maxAngularSpeed
      else if (w < -this.maxAngularSpeed) w = -this.maxAngularSpeed
    }

    return {
      vehicleId: this.vehicleId,
      linearVelocity: v,
      angularVelocity: w,
      source: 'external',
    }
  }

  fromInternal(value: VehicleCommand): RosTwistMessage {
    const linearX = value.linearVelocity ?? 0
    const angularZ = value.angularVelocity ?? 0

    if (!Number.isFinite(linearX)) {
      throw new Error(
        'RosTwistToVehicleCommandAdapter.fromInternal: linearVelocity must be a finite number',
      )
    }
    if (!Number.isFinite(angularZ)) {
      throw new Error(
        'RosTwistToVehicleCommandAdapter.fromInternal: angularVelocity must be a finite number',
      )
    }

    return {
      linear: { x: linearX, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angularZ },
    }
  }
}

function assertTwist(message: unknown): RosTwistMessage {
  if (typeof message !== 'object' || message === null) {
    throw new Error('Twist message must be an object')
  }
  const value = message as { linear?: unknown; angular?: unknown }
  const linear = assertVector3(value.linear, 'linear')
  const angular = assertVector3(value.angular, 'angular')
  return { linear, angular }
}

function assertVector3(
  value: unknown,
  fieldName: string,
): { x: number; y: number; z: number } {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Twist.${fieldName} must be an object with x, y, z`)
  }
  const v = value as { x?: unknown; y?: unknown; z?: unknown }
  return {
    x: requireFiniteNumber(v.x, `${fieldName}.x`),
    y: requireFiniteNumber(v.y, `${fieldName}.y`),
    z: requireFiniteNumber(v.z, `${fieldName}.z`),
  }
}

function requireFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`)
  }
  return value
}

function validateFiniteNumber(
  value: unknown,
  fieldName: string,
  fallback: number,
): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `RosTwistToVehicleCommandAdapter: ${fieldName} must be a finite number`,
    )
  }
  return value
}

function validatePositiveLimit(
  value: unknown,
  fieldName: string,
): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(
      `RosTwistToVehicleCommandAdapter: ${fieldName} must be a finite number > 0`,
    )
  }
  return value
}
