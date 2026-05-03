import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'
import type { SimClockMessage } from '../../../../simulation/communication/messages/SimClockMessage'
import type { RosClockMessage } from '../RosMessageTypes'

const NANOS_PER_SEC = 1_000_000_000

/**
 * Adapter: `SimClockMessage` ↔ `rosgraph_msgs/msg/Clock`.
 *
 * The simulator measures time as a single `timeSec: number` (seconds,
 * floating-point). ROS 2 uses an integer pair (`sec`, `nanosec`) to
 * avoid the f32/f64 precision wobble that bites long-running runs.
 *
 * Outbound (`fromInternal`):
 *
 *   timeSec → { clock: { sec, nanosec } }   (split into integer parts)
 *
 * Special cases:
 *   - Negative times are preserved by sign-extending `sec`. ROS 2's
 *     canonical Time uses signed `int32 sec`, so negative values are
 *     valid. `nanosec` is kept as a non-negative int in [0, 1e9) so
 *     it always represents the same instant as `timeSec` reconstructed
 *     via `sec + nanosec/1e9` (e.g. -0.25 s → sec=-1, nanosec=750_000_000).
 *
 * Inbound (`toInternal`):
 *
 *   { clock: { sec, nanosec } } → SimClockMessage
 *
 * `dtSec` and `tick` are NOT carried by `rosgraph_msgs/Clock`. They
 * default to `0` on inbound; producers that need them must supply
 * them through a richer message type.
 */
export class SimClockToRosClockAdapter
  implements MessageAdapter<unknown, SimClockMessage>
{
  toInternal(message: unknown): SimClockMessage {
    if (typeof message !== 'object' || message === null) {
      throw new Error('Clock message must be an object')
    }
    const value = message as { clock?: unknown }
    if (typeof value.clock !== 'object' || value.clock === null) {
      throw new Error('Clock message must contain a "clock" object')
    }
    const time = value.clock as { sec?: unknown; nanosec?: unknown }

    const sec = requireFiniteInteger(time.sec, 'clock.sec')
    const nanosec = requireFiniteInteger(time.nanosec, 'clock.nanosec')

    if (nanosec < 0 || nanosec >= NANOS_PER_SEC) {
      throw new Error(
        `clock.nanosec must be in [0, ${NANOS_PER_SEC}); got ${nanosec}`,
      )
    }

    return {
      timeSec: sec + nanosec / NANOS_PER_SEC,
      dtSec: 0,
      tick: 0,
    }
  }

  fromInternal(value: SimClockMessage): RosClockMessage {
    if (typeof value.timeSec !== 'number' || !Number.isFinite(value.timeSec)) {
      throw new Error('SimClockMessage.timeSec must be a finite number')
    }

    // Use Math.floor so negative times round towards -∞, which keeps
    // `nanosec` in [0, 1e9). E.g. timeSec = -0.25 →
    //   sec = floor(-0.25) = -1
    //   nanosec = round((-0.25 - (-1)) * 1e9) = 750_000_000
    // and -1 + 750_000_000 / 1e9 = -0.25 ✓.
    const sec = Math.floor(value.timeSec)
    const nanosec = Math.round((value.timeSec - sec) * NANOS_PER_SEC)

    // Math.round of a value already at exactly NANOS_PER_SEC (possible
    // through floating-point rounding) would produce an out-of-range
    // nanosec; carry it into `sec` to keep the normalized invariant.
    if (nanosec === NANOS_PER_SEC) {
      return { clock: { sec: sec + 1, nanosec: 0 } }
    }

    return { clock: { sec, nanosec } }
  }
}

function requireFiniteInteger(value: unknown, fieldName: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw new Error(`${fieldName} must be a finite integer`)
  }
  return value
}
