import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import type { VehicleMotionRuntime } from '../simulation/physics/VehicleMotionRuntime'
import type { VehicleMotionRuntimeConfig } from '../simulation/physics/VehicleMotionRuntimeConfig'

/**
 * Constructs the `VehicleMotionRuntime` for the requested config.
 *
 * `kinematic` is the only runtime available today. Requesting `rapier` or
 * `remote` throws immediately so callers know they asked for something
 * unimplemented rather than silently receiving a different runtime.
 *
 * Future runtime implementations belong in `src/infrastructure/` and should
 * be wired here once available.
 */
export function buildVehicleMotionRuntime(
  config: VehicleMotionRuntimeConfig,
): VehicleMotionRuntime {
  switch (config.type) {
    case 'kinematic':
      return new KinematicVehicleMotionRuntime()
    case 'rapier':
      throw new Error('Vehicle motion runtime "rapier" is not implemented yet.')
    case 'remote':
      throw new Error('Vehicle motion runtime "remote" is not implemented yet.')
  }
}
