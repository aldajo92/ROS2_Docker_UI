import type { MessageAdapter } from '../MessageAdapter'
import type { VehicleCommand } from '../../commands/VehicleCommand'

/**
 * Pass-through adapter for JSON-shaped vehicle commands. Decodes
 * external payloads into the canonical `VehicleCommand` (the same
 * type the keyboard mapper, scenario scripts, and any other producer
 * pushes into `VehicleCommandQueue`). The adapter is the only place
 * external bytes are validated; downstream code can assume a
 * well-formed `VehicleCommand`.
 *
 * Validation:
 *   - `vehicleId` MUST be a non-empty string.
 *   - All other physical fields are optional, but if present they
 *     MUST be finite numbers (no `NaN`, no `±Infinity`, no
 *     stringified numbers).
 *   - `source` defaults to `'external'` when missing — every
 *     transport-borne command is "external" by definition.
 *   - `timestampSec`, when present, MUST be a finite number (sim
 *     time in seconds).
 *
 * For non-JSON wire formats (protobuf, ROS2 msgs, …), implement a
 * dedicated `MessageAdapter<TWire, VehicleCommand>` — never extend
 * this one with format-specific knowledge.
 */
export class JsonVehicleCommandAdapter
  implements MessageAdapter<unknown, VehicleCommand>
{
  toInternal(message: unknown): VehicleCommand {
    if (typeof message !== 'object' || message === null) {
      throw new Error('Vehicle command message must be an object')
    }

    const value = message as Record<string, unknown>

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
      timestampSec: optionalNumber(value.timestampSec, 'timestampSec'),
      source: optionalSource(value.source),
    }
  }

  fromInternal(value: VehicleCommand): unknown {
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

const KNOWN_SOURCES: ReadonlyArray<NonNullable<VehicleCommand['source']>> = [
  'keyboard',
  'external',
  'scenario',
  'planner',
  'unknown',
]

/**
 * Default to `'external'` so a transport-borne command is correctly
 * tagged for logging / replay even when the producer omits the
 * field. Unknown source strings are rejected rather than silently
 * remapped — callers should send a known tag or omit the field.
 */
function optionalSource(value: unknown): VehicleCommand['source'] {
  if (value === undefined) return 'external'
  if (typeof value !== 'string') {
    throw new Error('source must be a string')
  }
  if (!KNOWN_SOURCES.includes(value as NonNullable<VehicleCommand['source']>)) {
    throw new Error(
      `source must be one of: ${KNOWN_SOURCES.join(', ')} (got "${value}")`,
    )
  }
  return value as VehicleCommand['source']
}
