/**
 * Identifies which vehicle motion runtime the composition root should build.
 * `kinematic`, `rapier`, `rapier3d`, and `remote` are all registered. Heavy
 * runtime implementations belong in `src/infrastructure/` — this file owns
 * only the selection contract.
 *
 * `rapier3d` is an additive experimental path: Rapier 3D physics on the XY
 * ground plane. It is independent of the stable `kinematic` baseline and does
 * not change existing runtime semantics.
 */
export type VehicleMotionRuntimeType = 'kinematic' | 'rapier' | 'rapier3d' | 'remote'

export interface VehicleMotionRuntimeConfig {
  type: VehicleMotionRuntimeType
}

export const DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG: VehicleMotionRuntimeConfig = {
  type: 'kinematic',
}
