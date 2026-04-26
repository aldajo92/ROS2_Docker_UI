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
/**
 * Active collision backend selector.
 *
 *   - `'disabled'`     — `NoopCollisionBackend2D`. Keeps the
 *                        `CollisionSystem` registered (so the tick
 *                        pipeline shape never changes) but skips all
 *                        broad/narrow-phase work. Useful for tests,
 *                        benchmarks, and "free-driving" demos.
 *   - `'simpleCircle2D'` — built-in O(n²) circle backend. Default.
 *   - `'rapier2D'`     — heavy WASM backend under
 *                        `infrastructure/collision/rapier/`. Requires
 *                        async `create()` and is opt-in.
 */
export type CollisionBackendType = 'disabled' | 'simpleCircle2D' | 'rapier2D'

export interface CollisionConfig {
  backend: CollisionBackendType
}

export const DEFAULT_COLLISION_CONFIG: CollisionConfig = {
  backend: 'simpleCircle2D',
}
