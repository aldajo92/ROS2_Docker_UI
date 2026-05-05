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

describe('ScenarioLoader.parse — static_obstacle shape discriminator', () => {
  it('parses a legacy circular obstacle (no shape field)', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [
        {
          kind: 'static_obstacle',
          id: 'pillar',
          position: { x: 2, y: 1 },
          radius: 0.35,
        },
      ],
    })
    const obs = spec.entities[0]
    if (obs.kind !== 'static_obstacle') throw new Error('expected obstacle')
    expect(obs.shape).toBe('circle')
    if (obs.shape !== 'circle') throw new Error('expected circle')
    expect(obs.position).toEqual({ x: 2, y: 1 })
    expect(obs.radius).toBe(0.35)
  })

  it('parses an explicit circle obstacle', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [
        {
          kind: 'static_obstacle',
          id: 'pillar',
          shape: 'circle',
          position: { x: 2, y: 1 },
          radius: 0.35,
        },
      ],
    })
    const obs = spec.entities[0]
    if (obs.kind !== 'static_obstacle' || obs.shape !== 'circle') {
      throw new Error('expected circle obstacle')
    }
    expect(obs.radius).toBe(0.35)
  })

  it('parses a rectangle obstacle in center mode', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [
        {
          kind: 'static_obstacle',
          id: 'box_1',
          shape: 'rectangle',
          rectangle: {
            mode: 'center',
            center: { x: 4, y: 2 },
            length: 2.4,
            thickness: 1.2,
            yaw: Math.PI / 4,
          },
        },
      ],
    })
    const obs = spec.entities[0]
    if (obs.kind !== 'static_obstacle' || obs.shape !== 'rectangle') {
      throw new Error('expected rectangle obstacle')
    }
    if (obs.rectangle.mode !== 'center') {
      throw new Error('expected center mode')
    }
    expect(obs.rectangle.center).toEqual({ x: 4, y: 2 })
    expect(obs.rectangle.length).toBe(2.4)
    expect(obs.rectangle.thickness).toBe(1.2)
    expect(obs.rectangle.yaw).toBeCloseTo(Math.PI / 4)
  })

  it('parses a rectangle obstacle in segment mode', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [
        {
          kind: 'static_obstacle',
          id: 'wall_1',
          shape: 'rectangle',
          rectangle: {
            mode: 'segment',
            start: { x: -2, y: -1 },
            end: { x: 3, y: -1 },
            thickness: 0.25,
          },
        },
      ],
    })
    const obs = spec.entities[0]
    if (obs.kind !== 'static_obstacle' || obs.shape !== 'rectangle') {
      throw new Error('expected rectangle obstacle')
    }
    if (obs.rectangle.mode !== 'segment') {
      throw new Error('expected segment mode')
    }
    expect(obs.rectangle.start).toEqual({ x: -2, y: -1 })
    expect(obs.rectangle.end).toEqual({ x: 3, y: -1 })
    expect(obs.rectangle.thickness).toBe(0.25)
  })

  it('throws on unknown shape value', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'bad',
            shape: 'pentagon',
          },
        ],
      }),
    ).toThrow(/shape must be "circle" or "rectangle"/)
  })

  it('throws on unknown rectangle.mode', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'bad',
            shape: 'rectangle',
            rectangle: { mode: 'diagonal' },
          },
        ],
      }),
    ).toThrow(/mode must be "center" or "segment"/)
  })

  it('throws on center mode missing length', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'bad',
            shape: 'rectangle',
            rectangle: {
              mode: 'center',
              center: { x: 0, y: 0 },
              thickness: 1,
              yaw: 0,
            },
          },
        ],
      }),
    ).toThrow(/length/)
  })

  it('throws on non-positive thickness', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'bad',
            shape: 'rectangle',
            rectangle: {
              mode: 'center',
              center: { x: 0, y: 0 },
              length: 1,
              thickness: 0,
              yaw: 0,
            },
          },
        ],
      }),
    ).toThrow(/thickness/)
  })

  it('throws on segment mode with identical start and end', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'bad',
            shape: 'rectangle',
            rectangle: {
              mode: 'segment',
              start: { x: 1, y: 1 },
              end: { x: 1, y: 1 },
              thickness: 0.25,
            },
          },
        ],
      }),
    ).toThrow(/identical/)
  })

  it('throws on segment mode with non-finite endpoint coordinates', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [
          {
            kind: 'static_obstacle',
            id: 'bad',
            shape: 'rectangle',
            rectangle: {
              mode: 'segment',
              start: { x: NaN, y: 0 },
              end: { x: 1, y: 0 },
              thickness: 0.25,
            },
          },
        ],
      }),
    ).toThrow(ScenarioParseError)
  })
})

describe('ScenarioLoader.buildEntity — rectangle obstacles', () => {
  it('builds a rectangle obstacle from center mode and normalizes shape', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'static_obstacle',
      id: 'box_1',
      shape: 'rectangle',
      rectangle: {
        mode: 'center',
        center: { x: 4, y: 2 },
        length: 2.4,
        thickness: 1.2,
        yaw: Math.PI / 4,
      },
    })
    expect(e).toBeInstanceOf(StaticObstacleEntity)
    const s = e as StaticObstacleEntity
    expect(s.position.x).toBe(4)
    expect(s.position.y).toBe(2)
    expect(s.shape.type).toBe('rectangle')
    if (s.shape.type !== 'rectangle') throw new Error('expected rectangle')
    expect(s.shape.length).toBe(2.4)
    expect(s.shape.thickness).toBe(1.2)
    expect(s.shape.yaw).toBeCloseTo(Math.PI / 4)
    // Bounding radius = hypot(length/2, thickness/2).
    expect(s.radius).toBeCloseTo(Math.hypot(1.2, 0.6))
  })

  it('derives center, length, and yaw from segment mode', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'static_obstacle',
      id: 'wall',
      shape: 'rectangle',
      rectangle: {
        mode: 'segment',
        start: { x: -2, y: -1 },
        end: { x: 3, y: -1 },
        thickness: 0.25,
      },
    }) as StaticObstacleEntity
    expect(s_eq(e.position.x, 0.5)).toBe(true)
    expect(e.position.y).toBe(-1)
    if (e.shape.type !== 'rectangle') throw new Error('expected rectangle')
    expect(e.shape.length).toBeCloseTo(5)
    expect(e.shape.thickness).toBe(0.25)
    expect(e.shape.yaw).toBeCloseTo(0)
  })

  it('derives yaw = π/2 from a vertical segment (start below end)', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'static_obstacle',
      id: 'wall',
      shape: 'rectangle',
      rectangle: {
        mode: 'segment',
        start: { x: 1, y: -2 },
        end: { x: 1, y: 2 },
        thickness: 0.3,
      },
    }) as StaticObstacleEntity
    if (e.shape.type !== 'rectangle') throw new Error('expected rectangle')
    expect(e.shape.yaw).toBeCloseTo(Math.PI / 2)
    expect(e.shape.length).toBeCloseTo(4)
  })

  it('derives yaw = π/4 from a 45° diagonal segment', () => {
    const e = ScenarioLoader.buildEntity({
      kind: 'static_obstacle',
      id: 'wall',
      shape: 'rectangle',
      rectangle: {
        mode: 'segment',
        start: { x: 0, y: 0 },
        end: { x: 1, y: 1 },
        thickness: 0.2,
      },
    }) as StaticObstacleEntity
    if (e.shape.type !== 'rectangle') throw new Error('expected rectangle')
    expect(e.shape.yaw).toBeCloseTo(Math.PI / 4)
    expect(e.shape.length).toBeCloseTo(Math.SQRT2)
  })
})

function s_eq(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps
}

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

describe('ScenarioLoader.parse — interaction.keyboardControl', () => {
  it('parses a full keyboardControl block', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      interaction: {
        keyboardControl: {
          enabled: true,
          vehicleId: 'rover',
          forwardSpeed: 3.0,
          reverseSpeed: 1.5,
          angularSpeed: 2.0,
        },
      },
    })
    expect(spec.interaction?.keyboardControl).toEqual({
      enabled: true,
      vehicleId: 'rover',
      forwardSpeed: 3.0,
      reverseSpeed: 1.5,
      angularSpeed: 2.0,
    })
  })

  it('missing interaction block leaves spec.interaction undefined', () => {
    const spec = ScenarioLoader.parse({ name: 's', entities: [] })
    expect(spec.interaction).toBeUndefined()
  })

  it('missing keyboardControl is allowed (interaction is empty object)', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      interaction: {},
    })
    expect(spec.interaction).toBeDefined()
    expect(spec.interaction?.keyboardControl).toBeUndefined()
  })

  it('enabled = true with no vehicleId defaults to "ego"', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      interaction: { keyboardControl: { enabled: true } },
    })
    expect(spec.interaction?.keyboardControl?.vehicleId).toBe('ego')
  })

  it('enabled = false with no vehicleId leaves it undefined', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      interaction: { keyboardControl: { enabled: false } },
    })
    expect(spec.interaction?.keyboardControl?.vehicleId).toBeUndefined()
  })

  it('throws on non-boolean enabled', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        interaction: { keyboardControl: { enabled: 'yes' } },
      }),
    ).toThrow(/enabled must be a boolean/)
  })

  it('throws on non-string vehicleId', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        interaction: { keyboardControl: { vehicleId: 42 } },
      }),
    ).toThrow(/vehicleId must be a string/)
  })

  it('throws on negative forwardSpeed', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        interaction: { keyboardControl: { forwardSpeed: -1 } },
      }),
    ).toThrow(/forwardSpeed/)
  })

  it('throws on non-finite angularSpeed', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        interaction: { keyboardControl: { angularSpeed: NaN } },
      }),
    ).toThrow(/angularSpeed/)
  })

  it('throws on non-object interaction', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        interaction: 'not-object',
      }),
    ).toThrow(/interaction must be an object/)
  })

  it('does not require vehicleId to exist among entities', () => {
    // Per spec: "Do not require vehicleId to exist during parsing".
    // The mismatch is silently tolerated by VehicleCommandSystem.
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      interaction: { keyboardControl: { enabled: true, vehicleId: 'ghost' } },
    })
    expect(spec.interaction?.keyboardControl?.vehicleId).toBe('ghost')
  })
})

describe('ScenarioLoader.parse — trajectoryTracking', () => {
  it('accepts missing trajectoryTracking', () => {
    const spec = ScenarioLoader.parse({ name: 's', entities: [] })
    expect(spec.trajectoryTracking).toBeUndefined()
  })

  it('accepts and preserves trajectoryTracking config', () => {
    const spec = ScenarioLoader.parse({
      name: 'tracking-scenario',
      entities: [],
      trajectoryTracking: {
        enabled: true,
        trackAllSupportedEntities: false,
        defaultSamplingMode: 'pointCount',
        defaultMaxSamples: 500,
        defaultMinDistance: 0,
        entities: [
          {
            entityId: 'ego',
            enabled: true,
            samplingMode: 'pointCount',
            maxSamples: 500,
          },
          {
            entityId: 'actor_1',
            enabled: true,
            samplingMode: 'timeWindow',
            timeWindowSec: 10,
            maxSamples: 500,
            minSampleDtSec: 0.05,
            minDistance: 0.01,
          },
        ],
      },
    })
    expect(spec.trajectoryTracking?.enabled).toBe(true)
    expect(spec.trajectoryTracking?.entities).toHaveLength(2)
    expect(spec.trajectoryTracking?.entities?.[1].entityId).toBe('actor_1')
    expect(spec.trajectoryTracking?.entities?.[1].minSampleDtSec).toBe(0.05)
  })

  it('rejects invalid sampling mode', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        trajectoryTracking: { defaultSamplingMode: 'radial' as never },
      }),
    ).toThrow(/pointCount/)
  })

  it('rejects non-integer defaultMaxSamples', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        trajectoryTracking: { defaultMaxSamples: 2.5 },
      }),
    ).toThrow(/integer/)
  })

  it('rejects defaultMaxSamples < 2', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        trajectoryTracking: { defaultMaxSamples: 1 },
      }),
    ).toThrow(/integer/)
  })

  it('rejects non-positive defaultTimeWindowSec', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        trajectoryTracking: { defaultTimeWindowSec: 0 },
      }),
    ).toThrow(/> 0/)
  })

  it('rejects negative defaultMinSampleDtSec', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        trajectoryTracking: { defaultMinSampleDtSec: -1 },
      }),
    ).toThrow(/>= 0/)
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

describe('ScenarioLoader.parse — visualization', () => {
  it('accepts missing visualization', () => {
    const spec = ScenarioLoader.parse({ name: 's', entities: [] })
    expect(spec.visualization).toBeUndefined()
  })

  it('parses an empty visualization block', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      visualization: {},
    })
    expect(spec.visualization).toEqual({})
  })

  it('parses a full visualization.ros2Topics entry', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      visualization: {
        ros2Topics: [
          {
            topic: '/circle_path',
            messageType: 'nav_msgs/msg/Path',
            enabled: true,
            style: { color: '#ffaaff', thickness: 3 },
          },
        ],
      },
    })
    expect(spec.visualization?.ros2Topics).toHaveLength(1)
    expect(spec.visualization?.ros2Topics?.[0]).toEqual({
      topic: '/circle_path',
      messageType: 'nav_msgs/msg/Path',
      enabled: true,
      style: { color: '#ffaaff', thickness: 3 },
    })
  })

  it('parses PoseArray visualization arrowSize style', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      visualization: {
        ros2Topics: [
          {
            topic: '/pose_array',
            messageType: 'geometry_msgs/msg/PoseArray',
            style: { color: '#00bcd4', thickness: 1, arrowSize: 0.75 },
          },
        ],
      },
    })
    expect(spec.visualization?.ros2Topics?.[0]).toEqual({
      topic: '/pose_array',
      messageType: 'geometry_msgs/msg/PoseArray',
      style: { color: '#00bcd4', thickness: 1, arrowSize: 0.75 },
    })
  })

  it('omits style when not provided', () => {
    const spec = ScenarioLoader.parse({
      name: 's',
      entities: [],
      visualization: {
        ros2Topics: [
          { topic: '/a', messageType: 'nav_msgs/msg/Path' },
        ],
      },
    })
    expect(spec.visualization?.ros2Topics?.[0]).toEqual({
      topic: '/a',
      messageType: 'nav_msgs/msg/Path',
    })
  })

  it('rejects non-array ros2Topics', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: { ros2Topics: 'nope' as never },
      }),
    ).toThrow(/ros2Topics must be an array/)
  })

  it('rejects empty topic name', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [{ topic: '', messageType: 'nav_msgs/msg/Path' }],
        },
      }),
    ).toThrow(/topic must be a non-empty string/)
  })

  it('rejects empty messageType', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [{ topic: '/a', messageType: '' }],
        },
      }),
    ).toThrow(/messageType must be a non-empty string/)
  })

  it('rejects non-boolean enabled', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [
            {
              topic: '/a',
              messageType: 'nav_msgs/msg/Path',
              enabled: 'yes' as never,
            },
          ],
        },
      }),
    ).toThrow(/enabled must be a boolean/)
  })

  it('rejects invalid color hex', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [
            {
              topic: '/a',
              messageType: 'nav_msgs/msg/Path',
              style: { color: 'red' },
            },
          ],
        },
      }),
    ).toThrow(/#RRGGBB hex format/)
  })

  it('rejects 3-digit hex shorthand', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [
            {
              topic: '/a',
              messageType: 'nav_msgs/msg/Path',
              style: { color: '#abc' },
            },
          ],
        },
      }),
    ).toThrow(/#RRGGBB hex format/)
  })

  it('rejects non-positive thickness', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [
            {
              topic: '/a',
              messageType: 'nav_msgs/msg/Path',
              style: { thickness: 0 },
            },
          ],
        },
      }),
    ).toThrow(/thickness must be a finite number > 0/)
  })

  it('rejects non-finite thickness', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [
            {
              topic: '/a',
              messageType: 'nav_msgs/msg/Path',
              style: { thickness: Number.POSITIVE_INFINITY },
            },
          ],
        },
      }),
    ).toThrow(/thickness must be a finite number > 0/)
  })

  it('rejects non-positive arrowSize', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 's',
        entities: [],
        visualization: {
          ros2Topics: [
            {
              topic: '/pose_array',
              messageType: 'geometry_msgs/msg/PoseArray',
              style: { arrowSize: 0 },
            },
          ],
        },
      }),
    ).toThrow(/arrowSize must be a finite number > 0/)
  })
})
