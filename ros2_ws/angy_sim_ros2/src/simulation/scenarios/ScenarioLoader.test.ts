import { describe, expect, it } from 'vitest'
import { ScenarioLoader, ScenarioParseError } from './ScenarioLoader'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'

describe('ScenarioLoader.parse', () => {
  it('parses a minimal scenario', () => {
    const spec = ScenarioLoader.parse({
      name: 'test',
      entities: [],
    })
    expect(spec.name).toBe('test')
    expect(spec.entities).toEqual([])
    expect(spec.description).toBeUndefined()
  })

  it('parses a scenario with one of each entity kind', () => {
    const spec = ScenarioLoader.parse({
      name: 'mixed',
      description: 'all kinds',
      entities: [
        {
          kind: 'vehicle',
          id: 'ego',
          pose: { x: 1, y: 2, yaw: 0.3 },
          controls: { v: 0.5, w: -0.1 },
          radius: 0.4,
        },
        {
          kind: 'static_obstacle',
          id: 'box',
          position: { x: -1, y: 4 },
          radius: 0.5,
        },
        {
          kind: 'dynamic_actor',
          id: 'walker',
          pose: { x: 5, y: -2 },
          velocity: { vx: -0.3, vy: 0.2, w: 0 },
          radius: 0.3,
        },
      ],
    })

    expect(spec.entities).toHaveLength(3)
    expect(spec.entities[0].kind).toBe('vehicle')
    expect(spec.entities[1].kind).toBe('static_obstacle')
    expect(spec.entities[2].kind).toBe('dynamic_actor')
  })

  it('throws on missing name', () => {
    expect(() => ScenarioLoader.parse({ entities: [] })).toThrow(ScenarioParseError)
  })

  it('throws on non-array entities', () => {
    expect(() =>
      ScenarioLoader.parse({ name: 'bad', entities: 'not-array' }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on unknown entity kind', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [{ kind: 'spaceship', id: 'x' }],
      }),
    ).toThrow(/kind unknown/)
  })

  it('throws on missing static_obstacle.position', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [{ kind: 'static_obstacle', id: 'o', radius: 0.5 }],
      }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on non-finite numbers', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'o',
            position: { x: 1, y: NaN },
            radius: 0.5,
          },
        ],
      }),
    ).toThrow(ScenarioParseError)
  })
})

describe('ScenarioLoader.buildEntity', () => {
  it('builds a VehicleEntity with given pose and controls', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'vehicle',
      id: 'ego',
      pose: { x: 1, y: 2, yaw: Math.PI / 4 },
      controls: { v: 0.5, w: 0.1 },
      radius: 0.4,
    })
    expect(e).toBeInstanceOf(VehicleEntity)
    const v = e as VehicleEntity
    expect(v.id).toBe('ego')
    expect(v.pose.position.x).toBe(1)
    expect(v.pose.position.y).toBe(2)
    expect(v.pose.yaw).toBeCloseTo(Math.PI / 4)
    expect(v.controls.v).toBe(0.5)
    expect(v.controls.w).toBe(0.1)
    expect(v.radius).toBe(0.4)
  })

  it('builds a StaticObstacleEntity', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'static_obstacle',
      id: 'box',
      position: { x: -1, y: 4 },
      radius: 0.5,
    })
    expect(e).toBeInstanceOf(StaticObstacleEntity)
    const s = e as StaticObstacleEntity
    expect(s.position.x).toBe(-1)
    expect(s.position.y).toBe(4)
    expect(s.radius).toBe(0.5)
  })

  it('builds a DynamicActorEntity', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'dynamic_actor',
      id: 'walker',
      pose: { x: 0, y: 0 },
      velocity: { vx: 1, vy: 2, w: 0.5 },
      radius: 0.3,
    })
    expect(e).toBeInstanceOf(DynamicActorEntity)
    const d = e as DynamicActorEntity
    expect(d.velocity.x).toBe(1)
    expect(d.velocity.y).toBe(2)
    expect(d.angularVelocity).toBe(0.5)
  })
})

describe('ScenarioLoader.parse — paths', () => {
  it('parses a scenario with paths', () => {
    const spec = ScenarioLoader.parse({
      name: 'path-scenario',
      entities: [],
      paths: [
        {
          id: 'ego-ref',
          name: 'Ego reference path',
          vehicleId: 'ego',
          frameId: 'map',
          points: [
            { x: 0, y: 0, yaw: 0, targetVelocity: 1.0 },
            { x: 2, y: 0, yaw: 0, targetVelocity: 1.0 },
            { x: 4, y: 1, yaw: 0.3, targetVelocity: 0.8 },
          ],
        },
      ],
    })
    expect(spec.paths).toHaveLength(1)
    const path = spec.paths![0]
    expect(path.id).toBe('ego-ref')
    expect(path.name).toBe('Ego reference path')
    expect(path.vehicleId).toBe('ego')
    expect(path.frameId).toBe('map')
    expect(path.points).toHaveLength(3)
    expect(path.points[2].yaw).toBeCloseTo(0.3)
    expect(path.points[2].targetVelocity).toBe(0.8)
  })

  it('paths field absent → spec.paths is undefined', () => {
    const spec = ScenarioLoader.parse({ name: 'no-paths', entities: [] })
    expect(spec.paths).toBeUndefined()
  })

  it('preserves path order', () => {
    const spec = ScenarioLoader.parse({
      name: 'ordered',
      entities: [],
      paths: [
        { id: 'first', points: [{ x: 0, y: 0 }] },
        { id: 'second', points: [{ x: 1, y: 1 }] },
        { id: 'third', points: [{ x: 2, y: 2 }] },
      ],
    })
    expect(spec.paths!.map((p) => p.id)).toEqual(['first', 'second', 'third'])
  })

  it('optional point fields pass through when present', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      paths: [
        {
          id: 'p',
          points: [{ x: 1, y: 2, yaw: 0.5, targetVelocity: 2.0, timeSec: 3.0 }],
        },
      ],
    })
    const pt = spec.paths![0].points[0]
    expect(pt.yaw).toBe(0.5)
    expect(pt.targetVelocity).toBe(2.0)
    expect(pt.timeSec).toBe(3.0)
  })

  it('optional point fields absent → undefined', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      paths: [{ id: 'p', points: [{ x: 1, y: 2 }] }],
    })
    const pt = spec.paths![0].points[0]
    expect(pt.yaw).toBeUndefined()
    expect(pt.targetVelocity).toBeUndefined()
    expect(pt.timeSec).toBeUndefined()
  })

  it('throws if paths is not an array', () => {
    expect(() =>
      ScenarioLoader.parse({ name: 's', entities: [], paths: 'bad' }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on path with missing id', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        paths: [{ points: [{ x: 0, y: 0 }] }],
      }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on path with empty id string', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        paths: [{ id: '', points: [{ x: 0, y: 0 }] }],
      }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on path with empty points array', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        paths: [{ id: 'p', points: [] }],
      }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on point with NaN x', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        paths: [{ id: 'p', points: [{ x: NaN, y: 0 }] }],
      }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on point with Infinity y', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        paths: [{ id: 'p', points: [{ x: 0, y: Infinity }] }],
      }),
    ).toThrow(ScenarioParseError)
  })

  it('throws on non-finite optional field', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        paths: [{ id: 'p', points: [{ x: 0, y: 0, yaw: NaN }] }],
      }),
    ).toThrow(ScenarioParseError)
  })
})

describe('ScenarioLoader.loadFromUrl', () => {
  it('fetches and parses a scenario via an injected fetch', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ name: 'fetched', entities: [] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch

    const spec = await ScenarioLoader.loadFromUrl('/whatever.json', fakeFetch)
    expect(spec.name).toBe('fetched')
    expect(spec.entities).toEqual([])
  })

  it('rejects on HTTP error', async () => {
    const fakeFetch = (async () =>
      new Response('boom', { status: 500, statusText: 'Server Error' })) as typeof fetch

    await expect(
      ScenarioLoader.loadFromUrl('/missing.json', fakeFetch),
    ).rejects.toThrow(ScenarioParseError)
  })
})
