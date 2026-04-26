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

export interface StaticObstacleSpec {
  kind: 'static_obstacle'
  id: string
  position: { x: number; y: number }
  radius: number
}

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

export interface ScenarioSpec {
  name: string
  description?: string
  entities: EntitySpec[]
  paths?: PathSpec[]
  /** UI / interaction defaults applied at scenario load time. Owned
   *  by the React shell, not the simulation core — see
   *  `KeyboardControlScenarioConfig`. */
  interaction?: ScenarioInteractionConfig
}
