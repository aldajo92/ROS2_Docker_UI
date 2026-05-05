import type { TrajectoryTrackingConfig } from '../trajectories/TrajectoryTrackingConfig'

/**
 * Scenario data shapes. A "scenario" is a serializable description of
 * an initial world: a name plus a list of entity specs. The runtime
 * (engine + scenario loader) is responsible for materializing entity
 * instances from these specs.
 *
 * Keeping the shape data-only (no methods, no class) makes JSON
 * round-tripping trivial.
 */

export interface PoseSpec {
  x: number
  y: number
  yaw?: number
}

export interface VehicleSpec {
  kind: 'vehicle'
  id: string
  pose?: PoseSpec
  controls?: { v?: number; w?: number }
  radius?: number
}

/**
 * Classic circular obstacle. `shape` is optional so legacy scenario JSON
 * files (the ones that pre-date rectangle obstacles) keep parsing
 * unchanged — they're treated as `shape: 'circle'` implicitly.
 */
export interface CircleStaticObstacleSpec {
  kind: 'static_obstacle'
  id: string
  shape?: 'circle'
  position: { x: number; y: number }
  radius: number
}

/**
 * Rectangle parameterized by its center pose. `length` is the local
 * forward extent (along +X after applying `yaw`), `thickness` is the
 * lateral extent.
 */
export interface RectangleObstacleCenterSpec {
  mode: 'center'
  center: { x: number; y: number }
  length: number
  thickness: number
  yaw: number
}

/**
 * Rectangle parameterized by the two endpoints of its centerline plus a
 * perpendicular thickness. Useful for "walls" and axis-aligned barriers
 * where computing center/length/yaw by hand is tedious. The loader
 * derives:
 *
 *   center = midpoint(start, end)
 *   length = distance(start, end)      // MUST be > 0
 *   yaw    = atan2(end.y - start.y, end.x - start.x)
 *   thickness = thickness               // MUST be > 0
 */
export interface RectangleObstacleSegmentSpec {
  mode: 'segment'
  start: { x: number; y: number }
  end: { x: number; y: number }
  thickness: number
}

export type RectangleObstacleSpec =
  | RectangleObstacleCenterSpec
  | RectangleObstacleSegmentSpec

/**
 * Rectangular static obstacle. The `shape: 'rectangle'` discriminator is
 * required; the `rectangle` sub-object carries the geometry in either
 * center or segment form.
 */
export interface RectangleStaticObstacleSpec {
  kind: 'static_obstacle'
  id: string
  shape: 'rectangle'
  rectangle: RectangleObstacleSpec
}

export type StaticObstacleSpec =
  | CircleStaticObstacleSpec
  | RectangleStaticObstacleSpec

export interface DynamicActorSpec {
  kind: 'dynamic_actor'
  id: string
  pose?: PoseSpec
  velocity?: { vx?: number; vy?: number; w?: number }
  radius?: number
}

export type EntitySpec = VehicleSpec | StaticObstacleSpec | DynamicActorSpec

export interface PathPointSpec {
  x: number
  y: number
  yaw?: number
  targetVelocity?: number
  timeSec?: number
}

export interface PathSpec {
  id: string
  name?: string
  frameId?: 'map' | 'world' | string
  vehicleId?: string
  points: PathPointSpec[]
}

/**
 * Initial defaults for keyboard control declared by a scenario. None of
 * these fields are physical properties of any vehicle — they describe
 * how the *UI shell* should be configured when the scenario loads. The
 * Inspector is still the runtime source of truth and may override any
 * field; the simulation core never reads this struct.
 *
 * `vehicleId` is intentionally not validated against `entities` at
 * parse time so scenario JSON can be constructed in any order; runtime
 * mismatch is tolerated by `VehicleCommandSystem` (commands for missing
 * vehicles are dropped silently).
 */
export interface KeyboardControlScenarioConfig {
  enabled?: boolean
  vehicleId?: string
  forwardSpeed?: number
  reverseSpeed?: number
  angularSpeed?: number
}

/** Container for any future scenario-declared interaction defaults
 *  (keyboard, gamepad, touch, etc.). Optional everywhere so old
 *  scenarios keep parsing unchanged. */
export interface ScenarioInteractionConfig {
  keyboardControl?: KeyboardControlScenarioConfig
}

/**
 * Per-topic visual override declared by a scenario. Mirrors the runtime
 * `PathVisualConfig` (under `src/app/RenderableTopics.ts`) but is kept
 * here as a plain data shape so the simulation-side scenario loader does
 * not depend on UI/communication types. The fields are optional so a
 * scenario may carry just a color, just a thickness, plugin-specific fields,
 * or none of them.
 */
export interface ScenarioVisualizationTopicStyle {
  /** CSS HEX color in `#RRGGBB` form. */
  color?: string
  /** Line thickness in renderer-specific units (>= 0 finite). */
  thickness?: number
  /** Arrow length in meters. Used by `geometry_msgs/msg/PoseArray` topics. */
  arrowSize?: number
}

/**
 * One ROS 2 topic the scenario wants the UI to auto-select for
 * rendering, with optional style overrides applied via the
 * `RenderableTopicCapability` at scenario-load time.
 *
 * Architectural note: this struct lives on the scenario side and is
 * consumed by app-layer glue (`src/ui/scenario/ScenarioVisualizationSync.ts`
 * + `App.tsx`). The simulation core never reads it.
 */
export interface ScenarioVisualizationRos2Topic {
  /** Topic name, e.g. `/circle_path`. Non-empty. */
  topic: string
  /** ROS 2 message type, e.g. `nav_msgs/msg/Path`. Non-empty. */
  messageType: string
  /** Whether the topic is selected for rendering. Defaults to `true`. */
  enabled?: boolean
  /** Optional per-topic visual override. */
  style?: ScenarioVisualizationTopicStyle
}

/**
 * UI/communication-layer config carried by a scenario. Renderer- and
 * transport-agnostic; today only `ros2Topics` is defined, but the shape
 * leaves room for additional families (e.g. tf frames, markers, custom
 * overlays) without breaking existing JSON.
 */
export interface ScenarioVisualizationConfig {
  ros2Topics?: ScenarioVisualizationRos2Topic[]
}

export interface ScenarioSpec {
  name: string
  description?: string
  entities: EntitySpec[]
  paths?: PathSpec[]
  /** UI / interaction defaults applied at scenario load time. Owned
   *  by the React shell, not the simulation core — see
   *  `KeyboardControlScenarioConfig`. */
  interaction?: ScenarioInteractionConfig
  /** Simulation-owned trajectory sampling configuration (optional). */
  trajectoryTracking?: TrajectoryTrackingConfig
  /** UI/communication-layer visualization defaults (optional). The
   *  simulation core does not read this; the React shell applies it via
   *  the `RenderableTopicCapability` at scenario-load time. */
  visualization?: ScenarioVisualizationConfig
}
