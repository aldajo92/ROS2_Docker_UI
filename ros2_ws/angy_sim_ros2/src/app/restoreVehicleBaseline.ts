import type { VehicleCommand } from '../simulation/commands/VehicleCommand'
import type { ScenarioSpec, VehicleSpec } from '../simulation/scenarios/Scenario'

/**
 * Result of computing a vehicle's baseline command. The
 * `fromScenarioControls` flag is informational — useful for logs
 * that explain whether the restore came from scenario data or
 * defaulted to zero because the scenario didn't declare controls.
 */
export interface BaselineVehicleCommand {
  command: VehicleCommand
  fromScenarioControls: boolean
}

/**
 * Build the baseline `VehicleCommand` to enqueue when an external
 * Twist binding for `vehicleId` is deactivated.
 *
 * Behavior:
 *   - If the scenario declares `entities[vehicleId].controls`, use
 *     `controls.v` and `controls.w` (defaulting any missing field to 0).
 *   - Otherwise (vehicle missing, no controls field) restore zero
 *     velocity. The product rule explicitly forbids hardcoded constant
 *     velocities, but zero is the only safe "stop" in the absence of
 *     scenario data.
 *
 * The caller pushes the returned command into `VehicleCommandQueue`;
 * `VehicleCommandSystem` drains it on the next tick and calls
 * `vehicle.setCommand(...)` so we never mutate `VehicleEntity` from
 * the UI / provider layers.
 */
export function buildBaselineVehicleCommand(
  scenarioSpec: ScenarioSpec | undefined,
  vehicleId: string,
): BaselineVehicleCommand {
  const vehicle = scenarioSpec?.entities.find(
    (entity): entity is VehicleSpec =>
      entity.kind === 'vehicle' && entity.id === vehicleId,
  )
  const declaredControls = vehicle?.controls
  const linearVelocity = declaredControls?.v ?? 0
  const angularVelocity = declaredControls?.w ?? 0
  return {
    command: {
      vehicleId,
      linearVelocity,
      angularVelocity,
      source: 'scenario',
    },
    fromScenarioControls: declaredControls !== undefined,
  }
}
