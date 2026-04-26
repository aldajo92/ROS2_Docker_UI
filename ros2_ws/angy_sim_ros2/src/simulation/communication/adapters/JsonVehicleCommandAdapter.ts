import type { MessageAdapter } from '../MessageAdapter'
import type { SimVehicleCommandMessage } from '../messages/SimVehicleCommandMessage'

/**
 * Pass-through adapter for JSON-shaped vehicle commands. Validates the
 * required `vehicleId` and the type of each optional numeric field so
 * malformed messages can never reach the entity layer.
 *
 * For non-JSON wire formats (protobuf, ROS2 msgs, …), implement a
 * dedicated `MessageAdapter<TWire, SimVehicleCommandMessage>`.
 */
export class JsonVehicleCommandAdapter
  implements MessageAdapter<unknown, SimVehicleCommandMessage>
{
  toInternal(message: unknown): SimVehicleCommandMessage {
    if (typeof message !== 'object' || message === null) {
      throw new Error('Vehicle command message must be an object')
    }

    const value = message as Partial<SimVehicleCommandMessage>

    if (typeof value.vehicleId !== 'string' || value.vehicleId.length === 0) {
      throw new Error('Vehicle command message requires a non-empty vehicleId')
    }

    return {
      vehicleId: value.vehicleId,
      linearVelocity: optionalNumber(value.linearVelocity, 'linearVelocity'),
      angularVelocity: optionalNumber(value.angularVelocity, 'angularVelocity'),
      throttle: optionalNumber(value.throttle, 'throttle'),
      brake: optionalNumber(value.brake, 'brake'),
      steering: optionalNumber(value.steering, 'steering'),
    }
  }

  fromInternal(value: SimVehicleCommandMessage): unknown {
    return { ...value }
  }
}

function optionalNumber(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${fieldName} must be a finite number`)
  }
  return value
}
