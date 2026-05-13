import type { TrajectoryTrackingConfig } from '../trajectories/TrajectoryTrackingConfig'
import type { LidarSensorSpec } from '../sensors/LidarSensorSpec'

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
 * A named external connection. The first (and currently only) supported
 * kind is `rosbridge`. The `url` field is optional; when absent the
 * runtime uses the transport default configured by the UI.
 */
export interface ScenarioConnectionSpec {
  kind: 'rosbridge'
  url?: string
}

/**
 * Map of user-chosen connection ids to their specs. Connection ids must
 * be non-empty strings and are referenced by `ScenarioTopicSource.connection`.
 * Example: `{ "rosbridge": { "kind": "rosbridge", "url": "ws://localhost:9090" } }`.
 */
export type ScenarioConnectionsConfig = Record<string, ScenarioConnectionSpec>

/**
 * Identifies an external topic carried over a named connection.
 * `messageType` is required so the runtime can decide which adapter to
 * instantiate without inspecting the live topic list.
 */
export interface ScenarioTopicSource {
  /** Key into `ScenarioSpec.connections`. */
  connection: string
  /** ROS 2 topic name, e.g. `/cmd_vel`. Non-empty. */
  topic: string
  /** ROS 2 message type, e.g. `geometry_msgs/msg/Twist`. Non-empty. */
  messageType: string
}

/**
 * Scenario-declared action: an external topic that drives simulation
 * behavior. The first supported combination is
 * `messageType: 'geometry_msgs/msg/Twist'` with `target.kind: 'vehicle'`,
 * which routes Twist commands to the named vehicle via
 * `VehicleCommandTopicBridge`. Other message types in `actions[]` are
 * rejected by the parser.
 *
 * Field semantics:
 *   - `source.connection`: key into `connections`.
 *   - `source.topic`: ROS 2 topic to subscribe to.
 *   - `source.messageType`: `geometry_msgs/msg/Twist` (only valid value now).
 *   - `target.kind`: `'vehicle'` (required for Twist).
 *   - `target.id`: scenario vehicle entity id.
 *   - `enabled`: when `false`, the entry is stored but no bridge is created.
 *   - `scale.v` / `scale.w`: multipliers for `Twist.linear.x` / `Twist.angular.z`.
 *   - `limits.*`: positive speed clamps applied after scaling.
 *   - `timeoutSec` / `onTimeout`: parsed for forward compat; not yet wired.
 */
export interface ScenarioActionSpec {
  source: ScenarioTopicSource
  target?: {
    kind: 'vehicle'
    id: string
  }
  enabled?: boolean
  scale?: {
    v?: number
    w?: number
  }
  limits?: {
    maxForwardSpeed?: number
    maxReverseSpeed?: number
    maxAngularSpeed?: number
  }
  timeoutSec?: number
  onTimeout?: 'stop'
}

/**
 * Scenario-declared display: an external topic whose data the UI should
 * render as a visual artifact. Supported combinations:
 *   - `nav_msgs/msg/Path` → path2d display
 *   - `geometry_msgs/msg/PoseArray` → pose_array_2d display
 *
 * The simulation core never reads this; the React shell applies it via
 * `RenderableTopicCapability` at scenario-load time.
 */
export interface ScenarioDisplaySpec {
  source: ScenarioTopicSource
  enabled?: boolean
  style?: {
    /** CSS HEX color in `#RRGGBB` form. */
    color?: string
    /** Line thickness in renderer-specific units (> 0 finite). */
    thickness?: number
    /** Arrow length in meters. Used by `geometry_msgs/msg/PoseArray`. */
    arrowSize?: number
  }
}

/**
 * Noise configuration for a scenario publisher. Currently only
 * `model: 'gaussian2d'` is supported, which adds independent Gaussian
 * noise to `x`, `y`, and `yaw`.
 */
export interface ScenarioPublisherNoiseSpec {
  model: 'gaussian2d'
  stdDev: {
    x?: number
    y?: number
    yaw?: number
  }
  seed?: number
}

/**
 * Scenario-declared outbound publisher: the simulation publishes telemetry
 * to an external topic. This is distinct from `actions` (inbound) and
 * `displays` (inbound rendered). Currently the only supported
 * `messageType` is `geometry_msgs/msg/PoseWithCovarianceStamped`.
 *
 *   - `source.connection`: key into `connections`.
 *   - `topic`: ROS 2 topic to publish to.
 *   - `messageType`: must be `geometry_msgs/msg/PoseWithCovarianceStamped`.
 *   - `vehicleId`: id of the vehicle entity whose pose is published.
 *   - `frameId`: ROS frame for `header.frame_id` (default `"map"`).
 *   - `childFrameId`: ROS child frame id (default equals `vehicleId`).
 *   - `rateHz`: publish frequency in Hz (default 20).
 *   - `enabled`: when `false`, no bridge is created.
 *   - `noise`: optional noise model applied before publishing.
 */
export interface ScenarioPublisherSpec {
  source: {
    connection: string
  }
  topic: string
  messageType: string
  vehicleId?: string
  frameId?: string
  childFrameId?: string
  rateHz?: number
  enabled?: boolean
  noise?: ScenarioPublisherNoiseSpec
}

export interface ScenarioSpec {
  name: string
  description?: string
  entities: EntitySpec[]
  paths?: PathSpec[]
  /** UI / interaction defaults applied at scenario load time. Owned
   *  by the React shell, not the simulation core. Currently only
   *  `keyboardControl` is supported here. */
  interaction?: ScenarioInteractionConfig
  /** Simulation-owned trajectory sampling configuration (optional). */
  trajectoryTracking?: TrajectoryTrackingConfig
  /** Named external connections (e.g. rosbridge) referenced by
   *  `actions`, `displays`, and `publishers`. */
  connections?: ScenarioConnectionsConfig
  /** External topic → simulation behavior bindings (e.g. Twist → vehicle). */
  actions?: ScenarioActionSpec[]
  /** External topic → visual artifact bindings (e.g. Path → path2d). */
  displays?: ScenarioDisplaySpec[]
  /** Outbound telemetry publishers (e.g. noisy pose → ROS 2 topic). */
  publishers?: ScenarioPublisherSpec[]
  /** Simulated sensor configurations (e.g. lidar2d). Scenarios without
   *  this field continue to parse and run unchanged. */
  sensors?: LidarSensorSpec[]
}
