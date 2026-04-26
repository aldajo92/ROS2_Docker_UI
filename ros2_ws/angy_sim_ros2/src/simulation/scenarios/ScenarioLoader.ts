import { Point2D } from '../../math/geometry/Point2D'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Vector2D } from '../../math/geometry/Vector2D'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import type { Entity } from '../entities/Entity'
import type { EntitySpec, ScenarioSpec } from './Scenario'

export class ScenarioParseError extends Error {
  constructor(message: string) {
    super(`ScenarioParseError: ${message}`)
    this.name = 'ScenarioParseError'
  }
}

/**
 * Parses, validates, and materializes scenarios. Kept as a static
 * facade because there's no per-loader state to track — every scenario
 * load is independent.
 */
export class ScenarioLoader {
  static parse(input: unknown): ScenarioSpec {
    if (!isObj(input)) throw new ScenarioParseError('scenario must be an object')
    if (typeof input.name !== 'string') {
      throw new ScenarioParseError('scenario.name must be a string')
    }
    if (!Array.isArray(input.entities)) {
      throw new ScenarioParseError('scenario.entities must be an array')
    }
    const description =
      typeof input.description === 'string' ? input.description : undefined
    return {
      name: input.name,
      description,
      entities: input.entities.map((e: unknown, i: number) => parseEntity(e, i)),
    }
  }

  static async loadFromUrl(
    url: string,
    fetchFn: typeof fetch = fetch,
  ): Promise<ScenarioSpec> {
    const res = await fetchFn(url)
    if (!res.ok) {
      throw new ScenarioParseError(
        `failed to fetch scenario at ${url}: ${res.status} ${res.statusText}`,
      )
    }
    const json = (await res.json()) as unknown
    return ScenarioLoader.parse(json)
  }

  /** Build a runtime Entity from a typed spec. */
  static buildEntity(spec: EntitySpec): Entity {
    switch (spec.kind) {
      case 'vehicle':
        return new VehicleEntity({
          id: spec.id,
          pose: spec.pose
            ? Pose2D.of(spec.pose.x, spec.pose.y, spec.pose.yaw ?? 0)
            : undefined,
          controls: spec.controls
            ? { v: spec.controls.v ?? 0, w: spec.controls.w ?? 0 }
            : undefined,
          radius: spec.radius,
        })
      case 'static_obstacle':
        return new StaticObstacleEntity({
          id: spec.id,
          position: new Point2D(spec.position.x, spec.position.y),
          radius: spec.radius,
        })
      case 'dynamic_actor':
        return new DynamicActorEntity({
          id: spec.id,
          pose: spec.pose
            ? Pose2D.of(spec.pose.x, spec.pose.y, spec.pose.yaw ?? 0)
            : undefined,
          velocity: spec.velocity
            ? new Vector2D(spec.velocity.vx ?? 0, spec.velocity.vy ?? 0)
            : undefined,
          angularVelocity: spec.velocity?.w,
          radius: spec.radius,
        })
    }
  }
}

/* ------------------------------------------------------------------------ */
/* helpers                                                                  */
/* ------------------------------------------------------------------------ */

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function requireNumber(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ScenarioParseError(`${path} must be a finite number`)
  }
  return v
}

function optionalNumber(v: unknown, path: string): number | undefined {
  if (v === undefined) return undefined
  return requireNumber(v, path)
}

function parsePose(v: unknown, path: string): { x: number; y: number; yaw?: number } | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) throw new ScenarioParseError(`${path} must be an object`)
  return {
    x: requireNumber(v.x, `${path}.x`),
    y: requireNumber(v.y, `${path}.y`),
    yaw: optionalNumber(v.yaw, `${path}.yaw`),
  }
}

function parseControls(v: unknown, path: string): { v?: number; w?: number } | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) throw new ScenarioParseError(`${path} must be an object`)
  return {
    v: optionalNumber(v.v, `${path}.v`),
    w: optionalNumber(v.w, `${path}.w`),
  }
}

function parseVelocity(
  v: unknown,
  path: string,
): { vx?: number; vy?: number; w?: number } | undefined {
  if (v === undefined) return undefined
  if (!isObj(v)) throw new ScenarioParseError(`${path} must be an object`)
  return {
    vx: optionalNumber(v.vx, `${path}.vx`),
    vy: optionalNumber(v.vy, `${path}.vy`),
    w: optionalNumber(v.w, `${path}.w`),
  }
}

function parseEntity(input: unknown, index: number): EntitySpec {
  const path = `entities[${index}]`
  if (!isObj(input)) throw new ScenarioParseError(`${path} must be an object`)
  if (typeof input.id !== 'string') {
    throw new ScenarioParseError(`${path}.id must be a string`)
  }
  switch (input.kind) {
    case 'vehicle':
      return {
        kind: 'vehicle',
        id: input.id,
        pose: parsePose(input.pose, `${path}.pose`),
        controls: parseControls(input.controls, `${path}.controls`),
        radius: optionalNumber(input.radius, `${path}.radius`),
      }
    case 'static_obstacle': {
      if (!isObj(input.position)) {
        throw new ScenarioParseError(`${path}.position must be an object`)
      }
      return {
        kind: 'static_obstacle',
        id: input.id,
        position: {
          x: requireNumber(input.position.x, `${path}.position.x`),
          y: requireNumber(input.position.y, `${path}.position.y`),
        },
        radius: requireNumber(input.radius, `${path}.radius`),
      }
    }
    case 'dynamic_actor':
      return {
        kind: 'dynamic_actor',
        id: input.id,
        pose: parsePose(input.pose, `${path}.pose`),
        velocity: parseVelocity(input.velocity, `${path}.velocity`),
        radius: optionalNumber(input.radius, `${path}.radius`),
      }
    default:
      throw new ScenarioParseError(`${path}.kind unknown: ${String(input.kind)}`)
  }
}
