/**
 * Pure type/config declaration for the active collision backend.
 *
 * Strictly forbidden in this file:
 *   - imports from `infrastructure/...`
 *   - imports of Rapier, Three.js, or any concrete backend
 *
 * The type is consumed at the composition root (`SimulationProvider`),
 * which is the only place allowed to map a `CollisionBackendType` to
 * a concrete backend class.
 */
export type CollisionBackendType = 'simpleCircle2D' | 'rapier2D'

export interface CollisionConfig {
  backend: CollisionBackendType
}

export const DEFAULT_COLLISION_CONFIG: CollisionConfig = {
  backend: 'simpleCircle2D',
}
