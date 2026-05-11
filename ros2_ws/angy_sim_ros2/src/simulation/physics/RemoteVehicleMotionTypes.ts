/**
 * Normalized DTOs for the remote vehicle motion protocol.
 *
 * These types belong in src/simulation/ because they represent the project's
 * own motion schema, not a specific vendor transport. Infrastructure-side
 * clients import these; the simulation layer never imports from infrastructure.
 */

export interface RemoteVehicleSpec {
  vehicleId: string
  pose: { x: number; y: number; yaw: number }
  radius?: number
}

export interface RemoteVehicleCommand {
  vehicleId: string
  linearVelocity: number
  angularVelocity: number
}

export interface RemoteVehicleStepInput {
  dt: number
  commands: RemoteVehicleCommand[]
}

export interface RemoteVehicleStateResult {
  vehicleId: string
  pose: { x: number; y: number; yaw: number }
  velocity: { linear: number; angular: number }
  distanceTraveled: number
}

export interface RemoteVehicleStepResult {
  vehicles: RemoteVehicleStateResult[]
}
