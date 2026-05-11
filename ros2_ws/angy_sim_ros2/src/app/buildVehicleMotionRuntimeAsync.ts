import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { RapierVehicleMotionRuntime } from '../infrastructure/physics/rapier/RapierVehicleMotionRuntime'
import type { VehicleMotionRuntime } from '../simulation/physics/VehicleMotionRuntime'
import type { VehicleMotionRuntimeConfig } from '../simulation/physics/VehicleMotionRuntimeConfig'

/**
 * Async version of the vehicle motion runtime factory.
 *
 * Use this instead of `buildVehicleMotionRuntime` when the requested
 * runtime type may require async initialization (e.g. `rapier` needs
 * one-shot WASM init via `RapierVehicleMotionRuntime.create()`).
 *
 * After awaiting, pass the resolved runtime to `SimulationProvider` via
 * the `vehicleMotionRuntime` prop.
 *
 * `kinematic` is synchronous internally but is supported here so callers
 * can use a single code path regardless of the selected type.
 */
export async function buildVehicleMotionRuntimeAsync(
  config: VehicleMotionRuntimeConfig,
): Promise<VehicleMotionRuntime> {
  switch (config.type) {
    case 'kinematic':
      return new KinematicVehicleMotionRuntime()
    case 'rapier':
      return RapierVehicleMotionRuntime.create()
    case 'remote':
      throw new Error('Vehicle motion runtime "remote" is not implemented yet.')
  }
}
