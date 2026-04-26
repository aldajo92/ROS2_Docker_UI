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

export interface ScenarioSpec {
  name: string
  description?: string
  entities: EntitySpec[]
}
