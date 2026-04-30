import { describe, expect, it } from 'vitest'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'
import { Vector2D } from '../../math/geometry/Vector2D'
import { BaseEntity } from '../entities/BaseEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { VehicleEntity } from '../entities/VehicleEntity'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { SimulationState } from '../core/SimulationState'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { createSnapshotFromState } from './createSnapshotFromState'

function createState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

describe('createSnapshotFromState', () => {
  it('captures vehicle pose, velocity and radius', () => {
    const state = createState()
    const ego = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(1, 2, 0.5),
      radius: 0.4,
    })
    ego.v = 1.5
    ego.w = 0.2
    state.entities.add(ego)
    const snap = createSnapshotFromState(state)
    expect(snap.entities).toHaveLength(1)
    const e = snap.entities[0]
    expect(e.kind).toBe('vehicle')
    expect(e.id).toBe('ego')
    if (e.kind !== 'vehicle') throw new Error('expected vehicle')
    expect(e.pose).toEqual({ x: 1, y: 2, yaw: 0.5 })
    expect(e.velocity).toEqual({ v: 1.5, w: 0.2 })
    expect(e.radius).toBe(0.4)
  })

  it('captures static obstacle position and radius', () => {
    const state = createState()
    state.entities.add(
      new StaticObstacleEntity({
        id: 'rock',
        position: Point2D.of(3, 4),
        radius: 0.5,
      }),
    )
    const snap = createSnapshotFromState(state)
    const e = snap.entities[0]
    if (e.kind !== 'static_obstacle') throw new Error('expected obstacle')
    expect(e.position).toEqual({ x: 3, y: 4 })
    expect(e.radius).toBe(0.5)
  })

  it('captures dynamic actor pose and velocity', () => {
    const state = createState()
    state.entities.add(
      new DynamicActorEntity({
        id: 'ped',
        pose: Pose2D.of(5, 6, 0.1),
        velocity: new Vector2D(0.7, -0.2),
        angularVelocity: 0.3,
        radius: 0.25,
      }),
    )
    const snap = createSnapshotFromState(state)
    const e = snap.entities[0]
    if (e.kind !== 'dynamic_actor') throw new Error('expected actor')
    expect(e.pose).toEqual({ x: 5, y: 6, yaw: 0.1 })
    expect(e.velocity).toEqual({ vx: 0.7, vy: -0.2, w: 0.3 })
    expect(e.radius).toBe(0.25)
  })

  it('falls back to a generic snapshot for unknown entity types', () => {
    class CustomEntity extends BaseEntity {
      constructor(id: string) {
        super(id, 'custom')
      }
    }
    const state = createState()
    state.entities.add(new CustomEntity('x'))
    const snap = createSnapshotFromState(state)
    expect(snap.entities[0]).toEqual({ id: 'x', kind: 'generic', type: 'custom' })
  })

  it('uses metrics.ticks + 1 as the tick number (matches tick event)', () => {
    const state = createState()
    state.metrics.ticks = 4
    state.clock.tick(0.05)
    const snap = createSnapshotFromState(state)
    expect(snap.tick).toBe(5)
    expect(snap.timeSec).toBeCloseTo(0.05)
  })

  it('snapshot is JSON-safe (round-trips through stringify/parse)', () => {
    const state = createState()
    state.entities.add(new VehicleEntity({ id: 'ego', pose: Pose2D.of(1, 2, 3) }))
    state.entities.add(
      new StaticObstacleEntity({
        id: 'r',
        position: Point2D.of(0, 0),
        radius: 1,
      }),
    )
    const snap = createSnapshotFromState(state)
    const reparsed = JSON.parse(JSON.stringify(snap))
    expect(reparsed).toEqual(snap)
  })

  it('does not mutate state or entities', () => {
    const state = createState()
    const ego = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) })
    state.entities.add(ego)
    const beforePose = { ...ego.pose.position, yaw: ego.pose.yaw }
    const beforeTicks = state.metrics.ticks
    createSnapshotFromState(state)
    expect(ego.pose.position.x).toBe(beforePose.x)
    expect(ego.pose.position.y).toBe(beforePose.y)
    expect(ego.pose.yaw).toBe(beforePose.yaw)
    expect(state.metrics.ticks).toBe(beforeTicks)
  })

  it('omits the trajectories field when the registry is empty', () => {
    const state = createState()
    state.entities.add(
      new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) }),
    )
    const snap = createSnapshotFromState(state)
    expect(snap.trajectories).toBeUndefined()
    expect('trajectories' in snap).toBe(false)
  })

  it('serializes trajectories for multiple entities, preserving sample order', () => {
    const state = createState()
    state.entities.add(
      new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) }),
    )
    state.trajectories.append('ego', { timeSec: 0.1, x: 0, y: 0 }, 100)
    state.trajectories.append(
      'ego',
      { timeSec: 0.2, x: 0.5, y: 0, yaw: 0.05, speed: 5 },
      100,
    )
    state.trajectories.append('actor_1', { timeSec: 0.1, x: 5, y: 5 }, 100)
    const snap = createSnapshotFromState(state)
    expect(snap.trajectories).toHaveLength(2)
    const ego = snap.trajectories?.find((t) => t.entityId === 'ego')
    expect(ego?.samples).toHaveLength(2)
    expect(ego?.samples[0]).toEqual({ timeSec: 0.1, x: 0, y: 0 })
    expect(ego?.samples[1]).toEqual({
      timeSec: 0.2,
      x: 0.5,
      y: 0,
      yaw: 0.05,
      speed: 5,
    })
    const actor = snap.trajectories?.find((t) => t.entityId === 'actor_1')
    expect(actor?.samples).toEqual([{ timeSec: 0.1, x: 5, y: 5 }])
  })

  it('snapshot with trajectories is JSON-safe', () => {
    const state = createState()
    state.entities.add(
      new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) }),
    )
    state.trajectories.append(
      'ego',
      { timeSec: 0.1, x: 0, y: 0, yaw: 0, speed: 1 },
      100,
    )
    state.trajectories.append('ego', { timeSec: 0.2, x: 1, y: 0 }, 100)
    const snap = createSnapshotFromState(state)
    const reparsed = JSON.parse(
      JSON.stringify(snap),
    ) as typeof snap
    expect(reparsed).toEqual(snap)
    expect(reparsed.trajectories?.[0].samples).toHaveLength(2)
  })

  it('trajectory snapshots are decoupled from the live registry', () => {
    const state = createState()
    state.trajectories.append('ego', { timeSec: 0.1, x: 0, y: 0 }, 100)
    const snap = createSnapshotFromState(state)
    // Mutating the live registry after snapshotting must not affect
    // what was captured.
    state.trajectories.append('ego', { timeSec: 0.2, x: 1, y: 1 }, 100)
    expect(snap.trajectories?.[0].samples).toHaveLength(1)
    expect(snap.trajectories?.[0].samples[0]).toEqual({
      timeSec: 0.1,
      x: 0,
      y: 0,
    })
  })
})
