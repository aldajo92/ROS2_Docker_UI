import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import type { VehicleMotionRuntime } from '../simulation/physics/VehicleMotionRuntime'
import type { VehicleMotionRuntimeConfig } from '../simulation/physics/VehicleMotionRuntimeConfig'

/**
 * Thrown when the requested runtime type requires async initialization.
 * `SimulationProvider` catches this specifically to fall through to its async
 * init path. Any other error (e.g. unsupported type) is re-thrown immediately.
 */
export class VehicleMotionRuntimeAsyncRequired extends Error {
  constructor(type: string) {
    super(
      `Vehicle motion runtime "${type}" requires async initialization. ` +
        `Pass vehicleMotionRuntimeConfig={{ type: "${type}" }} to SimulationProvider, ` +
        `or await buildVehicleMotionRuntimeAsync({ type: "${type}" }) and inject via the ` +
        `vehicleMotionRuntime prop.`,
    )
    this.name = 'VehicleMotionRuntimeAsyncRequired'
  }
}

/**
 * Constructs the `VehicleMotionRuntime` for the requested config synchronously.
 *
 * `kinematic` is synchronous and used by default.
 *
 * `rapier` requires async WASM initialization — throws `VehicleMotionRuntimeAsyncRequired`
 * so callers can detect the need for async init without a string match.
 * `SimulationProvider` handles this automatically via its async path.
 *
 * `remote` is not yet implemented and throws a plain `Error`.
 */
export function buildVehicleMotionRuntime(
  config: VehicleMotionRuntimeConfig,
): VehicleMotionRuntime {
  switch (config.type) {
    case 'kinematic':
      return new KinematicVehicleMotionRuntime()
    case 'rapier':
      throw new VehicleMotionRuntimeAsyncRequired('rapier')
    case 'remote':
      throw new Error('Vehicle motion runtime "remote" is not implemented yet.')
  }
}
