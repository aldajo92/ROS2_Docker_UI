import { useEffect } from 'react'
import { useSimulation } from '../../app/useSimulation'
import { KeyboardInputSource } from './KeyboardInputSource'
import { KeyboardVehicleCommandMapper } from './KeyboardVehicleCommandMapper'

/**
 * React-side glue that connects browser keyboard events to the
 * simulation's `VehicleCommandQueue`.
 *
 * Flow per tick (when `enabled`):
 *   keydown / keyup → KeyboardInputSource.pressedKeys
 *                  → mapper.createCommand(simTime)
 *                  → commandQueue.push(command)
 *                  → VehicleCommandSystem.update (next tick boundary)
 *                  → vehicle.setCommand
 *                  → VehicleDynamicsSystem integrates pose
 *
 * Important: a command is pushed on **every** tick — including ticks
 * where no key is held — so releasing keys produces an explicit
 * `{ linearVelocity: 0, angularVelocity: 0 }` command, which is what
 * stops the vehicle (sticky `setCommand` semantics, see VehicleEntity).
 *
 * Disable behavior: when the effect tears down (because `enabled`
 * flipped to false, the controlled vehicle changed, or speeds were
 * edited) we push exactly one final zero command for the previously
 * controlled vehicle. Without this, releasing keys *and* disabling
 * within the same tick would leave the vehicle coasting at its last
 * applied velocity. Cheap insurance — the queue is drained at the
 * next tick boundary regardless.
 *
 * The hook deliberately does not gate by `engine.isRunning()`: while
 * the loop is paused no `tick` event is emitted, so no commands are
 * pushed. This avoids accidentally queuing commands during pause that
 * would then all flush at once on resume.
 */
export interface UseKeyboardVehicleControlOptions {
  /** When false, the hook is inert: no listeners attached, no
   *  commands produced. Toggle to enable / disable driving without
   *  unmounting the component. */
  enabled: boolean
  /** Vehicle to drive. Stale commands for missing vehicles are
   *  silently dropped by `VehicleCommandSystem`, so a wrong id is
   *  harmless but produces no motion. */
  vehicleId: string
  /** Override the default forward speed (m/s). */
  forwardSpeed?: number
  /** Override the default reverse speed (m/s). */
  reverseSpeed?: number
  /** Override the default angular speed (rad/s). */
  angularSpeed?: number
}

export function useKeyboardVehicleControl({
  enabled,
  vehicleId,
  forwardSpeed = 2.0,
  reverseSpeed = 1.0,
  angularSpeed = 1.5,
}: UseKeyboardVehicleControlOptions): void {
  const { engine, commandQueue } = useSimulation()

  useEffect(() => {
    if (!enabled) return

    const input = new KeyboardInputSource()
    const mapper = new KeyboardVehicleCommandMapper(input, {
      vehicleId,
      forwardSpeed,
      reverseSpeed,
      angularSpeed,
    })

    input.start()

    const unsubscribe = engine.events.on('tick', () => {
      commandQueue.push(mapper.createCommand(engine.clock.time()))
    })

    return () => {
      unsubscribe()
      input.stop()
      // Final zero command so the vehicle stops even though we're no
      // longer producing per-tick commands. Targets the *previous*
      // vehicleId captured by closure — important when the user
      // switches the controlled vehicle, so the old one doesn't
      // continue at its last commanded velocity.
      commandQueue.push({
        vehicleId,
        linearVelocity: 0,
        angularVelocity: 0,
        source: 'keyboard',
        timestampSec: engine.clock.time(),
      })
    }
  }, [
    enabled,
    vehicleId,
    forwardSpeed,
    reverseSpeed,
    angularSpeed,
    engine,
    commandQueue,
  ])
}
