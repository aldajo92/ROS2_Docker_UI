import type {
  RemoteVehicleSpec,
  RemoteVehicleStepInput,
  RemoteVehicleStepResult,
} from '../../../simulation/physics/RemoteVehicleMotionTypes'

/**
 * Contract for a remote vehicle motion backend.
 *
 * Implementations may talk to an in-process fake (tests), a local ROS 2 node
 * (future), or any other transport — callers see only this interface.
 *
 * All methods are async to accommodate real network round-trips. Sync-resolving
 * implementations (e.g. InMemoryRemoteVehicleMotionClient) are fully compatible.
 */
export interface RemoteVehicleMotionClient {
  /** One-shot setup — called once by the runtime factory before first use. */
  initialize?(): Promise<void>
  /** Restore the backend to its initial state. */
  reset(): Promise<void>
  /**
   * Register/deregister vehicles. Called every tick with the full active set.
   * New vehicles are seeded from their current pose; removed vehicles are discarded.
   */
  syncVehicles(vehicles: readonly RemoteVehicleSpec[]): Promise<void>
  /** Advance the simulation by `dt` seconds and return the new state snapshot. */
  step(input: RemoteVehicleStepInput): Promise<RemoteVehicleStepResult>
  /** Release any held resources (connections, processes, etc.). */
  dispose?(): Promise<void>
}
