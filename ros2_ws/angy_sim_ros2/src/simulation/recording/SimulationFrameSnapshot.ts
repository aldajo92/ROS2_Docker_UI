/**
 * Per-tick simulation snapshot. JSON-friendly by construction so a
 * `SimulationFrameSnapshot[]` can round-trip through
 * `JSON.stringify` / `JSON.parse` without losing fidelity.
 *
 * Snapshots are produced by `createSnapshotFromState` and consumed by
 * `SimulationRecorder` and the future replay loader. They MUST NOT
 * contain class instances, functions, Maps, Sets, or circular
 * references — keep the shape strictly serializable.
 */

export interface BaseEntitySnapshot {
  id: string
  kind: string
}

export interface VehicleEntitySnapshot extends BaseEntitySnapshot {
  kind: 'vehicle'
  pose: { x: number; y: number; yaw: number }
  velocity?: { v?: number; w?: number }
  radius?: number
}

export interface StaticObstacleEntitySnapshot extends BaseEntitySnapshot {
  kind: 'static_obstacle'
  position: { x: number; y: number }
  radius?: number
}

export interface DynamicActorEntitySnapshot extends BaseEntitySnapshot {
  kind: 'dynamic_actor'
  pose?: { x: number; y: number; yaw?: number }
  position?: { x: number; y: number }
  velocity?: { vx?: number; vy?: number; w?: number }
  radius?: number
}

/**
 * Catch-all for entity types not yet promoted to a typed snapshot.
 * The discriminator is the literal `'generic'` so TypeScript can
 * narrow `EntitySnapshot` cleanly; the original entity `type` is
 * preserved on the field of the same name so future versions of this
 * format can upgrade a generic kind into a typed one.
 */
export interface GenericEntitySnapshot extends BaseEntitySnapshot {
  kind: 'generic'
  type: string
  data?: Record<string, unknown>
}

export type EntitySnapshot =
  | VehicleEntitySnapshot
  | StaticObstacleEntitySnapshot
  | DynamicActorEntitySnapshot
  | GenericEntitySnapshot

/**
 * Optional event captured alongside the frame. Phase 1 does not
 * populate this; it exists so future phases can attach things like
 * collisions or scenario-driven cues without changing the schema.
 */
export interface ReplayEventSnapshot {
  type: string
  payload?: Record<string, unknown>
}

export interface SimulationFrameSnapshot {
  /** 1-based tick index matching the `tick` event the engine emits. */
  tick: number
  /** Simulation time in seconds at the end of this tick. */
  timeSec: number
  entities: EntitySnapshot[]
  events?: ReplayEventSnapshot[]
  metrics?: {
    totalDistance?: number
    peakSpeed?: number
    collisionCount?: number
  }
}
