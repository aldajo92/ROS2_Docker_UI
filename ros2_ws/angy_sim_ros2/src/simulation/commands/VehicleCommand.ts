/**
 * Addressed vehicle command. The "queued" form that flows from any
 * external input (keyboard, WebSocket / ROS2 bridge, scenario script,
 * Python planner, joystick, UI buttons) into `VehicleCommandQueue`,
 * where `VehicleCommandSystem` drains it during the simulation tick.
 *
 * Distinct from `AppliedVehicleCommand` in `entities/VehicleEntity.ts`:
 *   - `AppliedVehicleCommand` lacks `vehicleId` because it's already
 *     scoped to one entity — the form passed to `vehicle.setCommand`.
 *   - `VehicleCommand` (this type) carries routing metadata (`vehicleId`,
 *     `source`, `timestampSec`) so a single queue can receive commands
 *     for any vehicle from any input.
 *
 * Strict rules:
 *   - JSON-friendly: every field is a primitive or undefined. Safe to
 *     serialize, log, snapshot, replay.
 *   - No imports from React, Three.js, Phaser, ROS2, or WebSocket
 *     types. This file lives in `src/simulation`.
 *
 * Field semantics:
 *   - `linearVelocity` (m/s) and `angularVelocity` (rad/s) are the
 *     preferred channels for the current unicycle model.
 *   - `throttle` (0..1), `brake` (0..1), `steering` (-1..1) are
 *     reserved for richer kinematic models (bicycle, Ackermann). The
 *     unicycle integrator ignores them; sending them today is harmless.
 *   - `source` is informational and does not change behavior — useful
 *     for logging, replay, and prioritization in future arbitration.
 *   - `timestampSec` is simulation time (not wall-clock) at which the
 *     command was generated, when the producer can supply it.
 */
export interface VehicleCommand {
  vehicleId: string

  linearVelocity?: number
  angularVelocity?: number

  throttle?: number
  brake?: number
  steering?: number

  source?: 'keyboard' | 'external' | 'scenario' | 'planner' | 'unknown'
  timestampSec?: number
}
