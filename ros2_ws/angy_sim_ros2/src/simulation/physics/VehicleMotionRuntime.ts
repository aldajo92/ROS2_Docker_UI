import type { VehicleEntity } from '../entities/VehicleEntity'

export interface VehicleRuntimeState {
  vehicleId: string
  pose: { x: number; y: number; yaw: number }
  velocity: { linear: number; angular: number }
  distanceTraveled: number
}

export interface VehicleMotionRuntime {
  readonly name: string
  reset(): void
  syncVehicles(vehicles: readonly VehicleEntity[]): void
  step(dt: number): void
  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined
}
