/**
 * Identifies which vehicle motion runtime the composition root should build.
 * `kinematic`, `rapier`, and `remote` are all implemented. Heavy runtime
 * implementations belong in `src/infrastructure/` — this file owns only
 * the selection contract.
 */
export type VehicleMotionRuntimeType = 'kinematic' | 'rapier' | 'remote'

export interface VehicleMotionRuntimeConfig {
  type: VehicleMotionRuntimeType
}

export const DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG: VehicleMotionRuntimeConfig = {
  type: 'kinematic',
}
