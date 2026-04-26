import type { MessageAdapter } from '../MessageAdapter'
import type { SimClockMessage } from '../messages/SimClockMessage'

/**
 * Pass-through JSON adapter for the simulation clock topic. Validates
 * field types so consumers never see NaN / non-numeric data.
 */
export class JsonClockAdapter implements MessageAdapter<unknown, SimClockMessage> {
  toInternal(message: unknown): SimClockMessage {
    if (typeof message !== 'object' || message === null) {
      throw new Error('Clock message must be an object')
    }

    const value = message as Partial<SimClockMessage>
    requireFiniteNumber(value.timeSec, 'timeSec')
    requireFiniteNumber(value.dtSec, 'dtSec')
    if (
      typeof value.tick !== 'number' ||
      !Number.isFinite(value.tick) ||
      !Number.isInteger(value.tick) ||
      value.tick < 0
    ) {
      throw new Error('tick must be a non-negative integer')
    }

    return { timeSec: value.timeSec, dtSec: value.dtSec, tick: value.tick }
  }

  fromInternal(value: SimClockMessage): unknown {
    return { timeSec: value.timeSec, dtSec: value.dtSec, tick: value.tick }
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
