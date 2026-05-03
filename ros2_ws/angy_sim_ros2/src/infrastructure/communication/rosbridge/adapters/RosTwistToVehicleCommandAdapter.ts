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
  }

  toInternal(message: unknown): VehicleCommand {
    const twist = assertTwist(message)

    return {
      vehicleId: this.vehicleId,
      linearVelocity: twist.linear.x,
      angularVelocity: twist.angular.z,
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
