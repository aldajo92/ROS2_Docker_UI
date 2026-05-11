import type { VehicleEntity } from '../entities/VehicleEntity'
import { wrapAngle } from '../../math/geometry/operations2D'
import type { VehicleMotionRuntime, VehicleRuntimeState } from './VehicleMotionRuntime'

/**
 * Built-in kinematic runtime that reproduces the unicycle integration
 * semantics previously hardcoded in `VehicleEntity.update()`:
 *
 *   yaw_{t+1} = wrapAngle(yaw_t + w · dt)
 *   x_{t+1}   = x_t + v · cos(yaw_{t+1}) · dt
 *   y_{t+1}   = y_t + v · sin(yaw_{t+1}) · dt
 *
 * Yaw integrates first (semi-implicit) — see `VehicleEntity` for the rationale.
 */
export class KinematicVehicleMotionRuntime implements VehicleMotionRuntime {
  readonly name = 'kinematic'

  private vehicles: readonly VehicleEntity[] = []
  private readonly states = new Map<string, VehicleRuntimeState>()

  reset(): void {
    this.vehicles = []
    this.states.clear()
  }

  syncVehicles(vehicles: readonly VehicleEntity[]): void {
    this.vehicles = vehicles
  }

  step(dt: number): void {
    for (const vehicle of this.vehicles) {
      const { v, w } = vehicle.controls
      const newYaw = wrapAngle(vehicle.pose.yaw + w * dt)
      const newX = vehicle.pose.position.x + v * Math.cos(newYaw) * dt
      const newY = vehicle.pose.position.y + v * Math.sin(newYaw) * dt
      this.states.set(vehicle.id, {
        vehicleId: vehicle.id,
        pose: { x: newX, y: newY, yaw: newYaw },
        velocity: { linear: v, angular: w },
        distanceTraveled: vehicle.distanceTraveled + Math.abs(v) * dt,
      })
    }
  }

  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined {
    return this.states.get(vehicleId)
  }
}
