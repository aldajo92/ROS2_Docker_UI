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
 * `rapier`, `rapier3d`, and `remote` require async initialization — each throws
 * `VehicleMotionRuntimeAsyncRequired` so callers can detect the async path
 * without string matching. `SimulationProvider` handles this automatically.
 */
export function buildVehicleMotionRuntime(
  config: VehicleMotionRuntimeConfig,
): VehicleMotionRuntime {
  switch (config.type) {
    case 'kinematic':
      return new KinematicVehicleMotionRuntime()
    case 'rapier':
      throw new VehicleMotionRuntimeAsyncRequired('rapier')
    case 'rapier3d':
      throw new VehicleMotionRuntimeAsyncRequired('rapier3d')
    case 'remote':
      throw new VehicleMotionRuntimeAsyncRequired('remote')
  }
}
