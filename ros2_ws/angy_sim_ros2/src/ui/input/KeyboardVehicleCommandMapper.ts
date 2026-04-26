import type { VehicleCommand } from '../../simulation/commands/VehicleCommand'
import type { KeyboardInputSource } from './KeyboardInputSource'

/**
 * Translates a `KeyboardInputSource` snapshot into a single
 * `VehicleCommand` for one vehicle. Stateless w.r.t. the keyboard
 * (pure projection of "what's held right now") and free of any
 * `VehicleEntity` knowledge — it just produces JSON-friendly command
 * values that something else routes to the engine.
 *
 * Key bindings (case-insensitive, the keyboard source lowercases for us):
 *
 *   forward:  ArrowUp    | I
 *   reverse:  ArrowDown  | K
 *   left:     ArrowLeft  | J
 *   right:    ArrowRight | L
 *
 * Sign convention follows the simulation: +x linear is forward along
 * the vehicle heading; +z angular (CCW) is "left turn". Pressing
 * Left adds positive angular velocity; pressing Right subtracts it.
 *
 * Cancellation behavior: opposing keys (Up + Down, Left + Right)
 * cancel additively. Pressing all four yields zero. Pressing none
 * also yields zero — and that's exactly how "release-to-stop" works
 * end-to-end: the hook still pushes a command every tick, the mapper
 * still produces one with explicit zero values, and `setCommand`
 * applies them.
 */
export interface KeyboardVehicleCommandMapperConfig {
  /** Vehicle id this mapper targets, e.g. `"ego"`. */
  vehicleId: string
  /** Forward speed in m/s applied while ArrowUp / I is held. */
  forwardSpeed: number
  /** Reverse speed in m/s applied while ArrowDown / K is held.
   *  Positive value; the mapper subtracts it internally. */
  reverseSpeed: number
  /** Yaw rate in rad/s applied while ArrowLeft / J or
   *  ArrowRight / L is held. Positive value; sign is applied per key. */
  angularSpeed: number
}

export class KeyboardVehicleCommandMapper {
  private readonly input: KeyboardInputSource
  private readonly config: KeyboardVehicleCommandMapperConfig

  constructor(
    input: KeyboardInputSource,
    config: KeyboardVehicleCommandMapperConfig,
  ) {
    this.input = input
    this.config = config
  }

  createCommand(timestampSec?: number): VehicleCommand {
    const { forwardSpeed, reverseSpeed, angularSpeed, vehicleId } = this.config

    let linearVelocity = 0
    let angularVelocity = 0

    if (this.input.isPressed('arrowup') || this.input.isPressed('i')) {
      linearVelocity += forwardSpeed
    }
    if (this.input.isPressed('arrowdown') || this.input.isPressed('k')) {
      linearVelocity -= reverseSpeed
    }
    if (this.input.isPressed('arrowleft') || this.input.isPressed('j')) {
      angularVelocity += angularSpeed
    }
    if (this.input.isPressed('arrowright') || this.input.isPressed('l')) {
      angularVelocity -= angularSpeed
    }

    return {
      vehicleId,
      linearVelocity,
      angularVelocity,
      source: 'keyboard',
      timestampSec,
    }
  }
}
