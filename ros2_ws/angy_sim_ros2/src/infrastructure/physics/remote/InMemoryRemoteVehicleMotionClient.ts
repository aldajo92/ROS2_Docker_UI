import type { RemoteVehicleMotionClient } from './RemoteVehicleMotionClient'
import type {
  RemoteVehicleSpec,
  RemoteVehicleStepInput,
  RemoteVehicleStepResult,
} from '../../../simulation/physics/RemoteVehicleMotionTypes'

/**
 * In-process remote client that performs unicycle kinematic integration
 * without touching KinematicVehicleMotionRuntime.
 *
 * Used as the default backend wired by `buildVehicleMotionRuntimeAsync` for
 * `type: 'remote'` and in unit tests. A real transport (ROS 2, WebSocket, …)
 * can be swapped in by constructing `RemoteVehicleMotionRuntime` directly
 * with a different client.
 */
export class InMemoryRemoteVehicleMotionClient implements RemoteVehicleMotionClient {
  private readonly specs = new Map<string, RemoteVehicleSpec>()
  private readonly distanceTraveled = new Map<string, number>()

  async initialize(): Promise<void> {}

  async reset(): Promise<void> {
    this.specs.clear()
    this.distanceTraveled.clear()
  }

  async syncVehicles(vehicles: readonly RemoteVehicleSpec[]): Promise<void> {
    const active = new Set(vehicles.map((v) => v.vehicleId))

    for (const id of this.specs.keys()) {
      if (!active.has(id)) {
        this.specs.delete(id)
        this.distanceTraveled.delete(id)
      }
    }

    for (const v of vehicles) {
      this.specs.set(v.vehicleId, v)
      if (!this.distanceTraveled.has(v.vehicleId)) {
        this.distanceTraveled.set(v.vehicleId, 0)
      }
    }
  }

  async step(input: RemoteVehicleStepInput): Promise<RemoteVehicleStepResult> {
    const vehicles = []

    for (const cmd of input.commands) {
      const spec = this.specs.get(cmd.vehicleId)
      if (!spec) continue

      const { linearVelocity: v, angularVelocity: w } = cmd
      const { x, y, yaw } = spec.pose

      // Semi-implicit unicycle integration (yaw-first), matching KinematicVehicleMotionRuntime.
      const newYaw = Math.atan2(Math.sin(yaw + w * input.dt), Math.cos(yaw + w * input.dt))
      const newX = x + v * Math.cos(newYaw) * input.dt
      const newY = y + v * Math.sin(newYaw) * input.dt
      const newDist = (this.distanceTraveled.get(cmd.vehicleId) ?? 0) + Math.abs(v) * input.dt

      this.specs.set(cmd.vehicleId, { ...spec, pose: { x: newX, y: newY, yaw: newYaw } })
      this.distanceTraveled.set(cmd.vehicleId, newDist)

      vehicles.push({
        vehicleId: cmd.vehicleId,
        pose: { x: newX, y: newY, yaw: newYaw },
        velocity: { linear: v, angular: w },
        distanceTraveled: newDist,
      })
    }

    return { vehicles }
  }
}
