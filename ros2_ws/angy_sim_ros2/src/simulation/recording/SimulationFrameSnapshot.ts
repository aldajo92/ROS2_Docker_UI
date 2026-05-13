import type { EntityTrajectory2D } from '../trajectories/EntityTrajectory2D'
import type { LidarScan2D } from '../sensors/LidarScan2D'

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
  /**
   * Bounding circle radius of the obstacle (circle radius for circles,
   * enclosing circle radius for rectangles). Always present so legacy
   * replay loaders — the ones that pre-date rectangle obstacles —
   * continue to see a sensible value.
   */
  radius?: number
  /**
   * Shape discriminator, optional for backward compatibility.
   *   - `undefined` or `'circle'` → circle obstacle (old format).
   *   - `'rectangle'`            → rectangle obstacle; geometry comes
   *                                from the `rectangle` sibling below.
   */
  shape?: 'circle' | 'rectangle'
  /**
   * Normalized rectangle geometry (`center + length + thickness + yaw`).
   * Present only when `shape === 'rectangle'`.
   */
  rectangle?: {
    length: number
    thickness: number
    yaw: number
  }
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
  /**
   * Per-entity historical samples captured by `TrajectoryTrackingSystem`.
   * Optional and absent for both:
   *   1. older replay files written before trajectories were persisted, and
   *   2. simulations with trajectory tracking disabled.
   *
   * The shape mirrors `EntityTrajectory2D` from
   * `src/simulation/trajectories/`. It is structurally JSON-safe — only
   * primitives, arrays, and a `metadata?: Record<string, unknown>` —
   * so it round-trips through `JSON.stringify` / `JSON.parse`. Renderers
   * never read this field directly; replay loading writes it back into
   * `state.trajectories` so the live and replay paths look identical.
   */
  trajectories?: EntityTrajectory2D[]
  events?: ReplayEventSnapshot[]
  metrics?: {
    totalDistance?: number
    peakSpeed?: number
    collisionCount?: number
  }
  /**
   * Latest lidar scan per sensor at the time of this snapshot. Optional
   * for backward compatibility — older replay files without this field
   * still load correctly (the lidar registry will simply be empty).
   */
  lidarScans?: LidarScan2D[]
}
