import type { VehicleEntity } from '../../../simulation/entities/VehicleEntity'
import type { VehicleMotionRuntime, VehicleRuntimeState } from '../../../simulation/physics/VehicleMotionRuntime'
import type { RemoteVehicleMotionClient } from './RemoteVehicleMotionClient'

/**
 * Vehicle motion runtime that delegates physics to a remote backend via
 * `RemoteVehicleMotionClient`.
 *
 * ## Tick contract
 *
 * `step(dt)` is `async` and returns a `Promise<void>`. `VehicleDynamicsSystem`
 * awaits it, so all downstream systems (collision, metrics, recorder) see
 * current-tick poses rather than stale state.
 *
 * ## Operation ordering
 *
 * `reset()` and `syncVehicles()` are synchronous on the caller side but async
 * toward the remote backend. They append their client calls to an internal
 * serial Promise chain (`_opChain`). `step()` awaits that chain before issuing
 * `client.step()`, guaranteeing that the remote backend has fully processed the
 * preceding reset and vehicle-set changes before receiving the step command.
 *
 *   reset → syncVehicles → step (serialised through _opChain)
 *
 * Errors in the chain are swallowed so a transient backend failure does not
 * permanently stall the chain. Step errors propagate to `VehicleDynamicsSystem`.
 *
 * ## Reset safety
 *
 * `reset()` increments `generation`. After each `await` in `step()` the
 * generation is checked; if it changed the result is discarded. This prevents
 * a stale step response from repopulating state after a scenario reload.
 *
 * ## Architectural rules
 *   - Lives in src/infrastructure/. src/simulation/ must not import it.
 *   - VehicleDynamicsSystem knows only VehicleMotionRuntime.
 *   - Transport details stay inside the client implementation.
 */
export class RemoteVehicleMotionRuntime implements VehicleMotionRuntime {
  readonly name = 'remote'

  private currentVehicles: readonly VehicleEntity[] = []
  private readonly states = new Map<string, VehicleRuntimeState>()

  /** Serial chain for reset / syncVehicles operations. Always resolves (errors swallowed). */
  private _opChain: Promise<void> = Promise.resolve()

  /** Incremented on reset(); step() discards responses from a previous generation. */
  private generation = 0

  private constructor(private readonly client: RemoteVehicleMotionClient) {}

  static async create(client: RemoteVehicleMotionClient): Promise<RemoteVehicleMotionRuntime> {
    await client.initialize?.()
    return new RemoteVehicleMotionRuntime(client)
  }

  reset(): void {
    this.generation++
    this.states.clear()
    this.currentVehicles = []
    this._opChain = this._opChain
      .then(() => this.client.reset())
      .catch(() => {})
  }

  syncVehicles(vehicles: readonly VehicleEntity[]): void {
    this.currentVehicles = vehicles
    const specs = vehicles.map((v) => ({
      vehicleId: v.id,
      pose: { x: v.pose.position.x, y: v.pose.position.y, yaw: v.pose.yaw },
      radius: v.radius,
    }))
    this._opChain = this._opChain
      .then(() => this.client.syncVehicles(specs))
      .catch(() => {})
  }

  async step(dt: number): Promise<void> {
    const gen = this.generation

    // Await all pending reset/syncVehicles operations before issuing the step.
    // _opChain always resolves (chain errors are swallowed), so this never throws.
    await this._opChain

    // A reset() may have been called while we were waiting for prior ops.
    if (this.generation !== gen) return

    // Capture commands after the chain settles so we use the latest controls.
    const commands = this.currentVehicles.map((v) => ({
      vehicleId: v.id,
      linearVelocity: v.controls.v,
      angularVelocity: v.controls.w,
    }))

    const result = await this.client.step({ dt, commands })

    // Discard the response if reset() was called while the request was in-flight.
    if (this.generation !== gen) return

    for (const s of result.vehicles) {
      this.states.set(s.vehicleId, {
        vehicleId: s.vehicleId,
        pose: s.pose,
        velocity: s.velocity,
        distanceTraveled: s.distanceTraveled,
      })
    }
  }

  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined {
    return this.states.get(vehicleId)
  }

  dispose(): void {
    void this.client.dispose?.()
  }
}
