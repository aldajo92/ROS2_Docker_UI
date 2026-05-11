import { KinematicVehicleMotionRuntime } from '../simulation/physics/KinematicVehicleMotionRuntime'
import { RapierVehicleMotionRuntime } from '../infrastructure/physics/rapier/RapierVehicleMotionRuntime'
import { RemoteVehicleMotionRuntime } from '../infrastructure/physics/remote/RemoteVehicleMotionRuntime'
import { InMemoryRemoteVehicleMotionClient } from '../infrastructure/physics/remote/InMemoryRemoteVehicleMotionClient'
import type { VehicleMotionRuntime } from '../simulation/physics/VehicleMotionRuntime'
import type { VehicleMotionRuntimeConfig } from '../simulation/physics/VehicleMotionRuntimeConfig'

/**
 * Async version of the vehicle motion runtime factory.
 *
 * Use this instead of `buildVehicleMotionRuntime` when the requested
 * runtime type may require async initialization:
 *   - `rapier` — one-shot WASM init via `RapierVehicleMotionRuntime.create()`
 *   - `remote` — client initialize() via `RemoteVehicleMotionRuntime.create()`
 *
 * `kinematic` is synchronous internally but is supported here so callers
 * can use a single code path regardless of the selected type.
 *
 * The `remote` case wires `InMemoryRemoteVehicleMotionClient` by default.
 * To use a real transport, construct `RemoteVehicleMotionRuntime.create(client)`
 * directly and inject via the `vehicleMotionRuntime` prop on SimulationProvider.
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
      return RemoteVehicleMotionRuntime.create(new InMemoryRemoteVehicleMotionClient())
  }
}
