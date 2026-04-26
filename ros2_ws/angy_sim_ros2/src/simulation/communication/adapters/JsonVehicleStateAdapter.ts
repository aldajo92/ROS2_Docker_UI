import type { MessageAdapter } from '../MessageAdapter'
import type { SimVehicleStateMessage } from '../messages/SimVehicleStateMessage'

/**
 * Pass-through JSON adapter for outbound vehicle state. The simulator
 * always emits internal-shaped messages, so `fromInternal` is a clone
 * (defensive copy so downstream consumers can't mutate engine state).
 *
 * `toInternal` is provided for completeness (e.g. replaying recorded
 * state into a passive viewer) and validates strictly.
 */
export class JsonVehicleStateAdapter
  implements MessageAdapter<unknown, SimVehicleStateMessage>
{
  toInternal(message: unknown): SimVehicleStateMessage {
    if (typeof message !== 'object' || message === null) {
      throw new Error('Vehicle state message must be an object')
    }

    const value = message as Partial<SimVehicleStateMessage>

    if (typeof value.id !== 'string' || value.id.length === 0) {
      throw new Error('Vehicle state message requires a non-empty id')
    }
    if (typeof value.pose !== 'object' || value.pose === null) {
      throw new Error('Vehicle state message requires a pose object')
    }

    const { x, y, yaw } = value.pose
    requireFiniteNumber(x, 'pose.x')
    requireFiniteNumber(y, 'pose.y')
    requireFiniteNumber(yaw, 'pose.yaw')
    requireFiniteNumber(value.velocity, 'velocity')
    requireFiniteNumber(value.angularVelocity, 'angularVelocity')

    return {
      id: value.id,
      pose: { x, y, yaw },
      velocity: value.velocity,
      angularVelocity: value.angularVelocity,
    }
  }

  fromInternal(value: SimVehicleStateMessage): unknown {
    return {
      id: value.id,
      pose: { x: value.pose.x, y: value.pose.y, yaw: value.pose.yaw },
      velocity: value.velocity,
      angularVelocity: value.angularVelocity,
    }
  }
}

function requireFiniteNumber(
  value: unknown,
  fieldName: string,
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`)
  }
}
