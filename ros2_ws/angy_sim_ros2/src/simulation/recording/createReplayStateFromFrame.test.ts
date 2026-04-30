import { describe, expect, it } from 'vitest'
import { createReplayStateFromFrame } from './createReplayStateFromFrame'
import type { SimulationFrameSnapshot } from './SimulationFrameSnapshot'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'

const FIXED_DT = 1 / 60

function buildFrame(
  partial: Partial<SimulationFrameSnapshot>,
): SimulationFrameSnapshot {
  return {
    tick: 1,
    timeSec: FIXED_DT,
    entities: [],
    ...partial,
  }
}

describe('createReplayStateFromFrame', () => {
  it('reports the recorded clock time and dt via the public API', () => {
    const state = createReplayStateFromFrame(
      buildFrame({ tick: 42, timeSec: 0.7 }),
      FIXED_DT,
    )
    expect(state.clock.time()).toBeCloseTo(0.7)
    expect(state.clock.dt()).toBeCloseTo(FIXED_DT)
    expect(state.metrics.ticks).toBe(42)
  })

  it('handles non-finite or non-positive fixedDtSec gracefully', () => {
    const state = createReplayStateFromFrame(
      buildFrame({ tick: 1, timeSec: 5 }),
      Number.NaN as unknown as number,
    )
    expect(state.clock.time()).toBeCloseTo(5)
    expect(state.clock.dt()).toBe(0)
  })

  it('reconstructs vehicle entities with pose, velocity, radius', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        entities: [
          {
            id: 'ego',
            kind: 'vehicle',
            pose: { x: 1.5, y: -2, yaw: 0.4 },
            velocity: { v: 1.2, w: 0.3 },
            radius: 0.5,
          },
        ],
      }),
      FIXED_DT,
    )
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    expect(vehicles).toHaveLength(1)
    const ego = vehicles[0]
    expect(ego.id).toBe('ego')
    expect(ego.pose.position.x).toBeCloseTo(1.5)
    expect(ego.pose.position.y).toBeCloseTo(-2)
    expect(ego.pose.yaw).toBeCloseTo(0.4)
    expect(ego.v).toBeCloseTo(1.2)
    expect(ego.w).toBeCloseTo(0.3)
    expect(ego.radius).toBeCloseTo(0.5)
  })

  it('reconstructs static obstacles', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        entities: [
          {
            id: 'wall',
            kind: 'static_obstacle',
            position: { x: 4, y: 5 },
            radius: 1,
          },
        ],
      }),
      FIXED_DT,
    )
    const obstacles =
      state.entities.byType<StaticObstacleEntity>('static_obstacle')
    expect(obstacles).toHaveLength(1)
    expect(obstacles[0].position.x).toBe(4)
    expect(obstacles[0].position.y).toBe(5)
    expect(obstacles[0].radius).toBe(1)
  })

  it('reconstructs dynamic actors with pose + velocity', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        entities: [
          {
            id: 'pedestrian',
            kind: 'dynamic_actor',
            pose: { x: 2, y: 3, yaw: 1 },
            velocity: { vx: 0.5, vy: -0.5, w: 0.2 },
            radius: 0.25,
          },
        ],
      }),
      FIXED_DT,
    )
    const actors = state.entities.byType<DynamicActorEntity>('dynamic_actor')
    expect(actors).toHaveLength(1)
    expect(actors[0].pose.position.x).toBe(2)
    expect(actors[0].pose.position.y).toBe(3)
    expect(actors[0].pose.yaw).toBeCloseTo(1)
    expect(actors[0].velocity.x).toBeCloseTo(0.5)
    expect(actors[0].velocity.y).toBeCloseTo(-0.5)
    expect(actors[0].angularVelocity).toBeCloseTo(0.2)
  })

  it('skips generic entities (no spatial payload to reconstruct)', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        entities: [
          {
            id: 'sensor',
            kind: 'generic',
            type: 'sensor',
          },
        ],
      }),
      FIXED_DT,
    )
    expect(state.entities.size()).toBe(0)
  })

  it('renderer-shaped APIs (toArray, all, byType) all work', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        entities: [
          {
            id: 'ego',
            kind: 'vehicle',
            pose: { x: 0, y: 0, yaw: 0 },
          },
          {
            id: 'wall',
            kind: 'static_obstacle',
            position: { x: 1, y: 1 },
            radius: 0.5,
          },
        ],
      }),
      FIXED_DT,
    )
    expect(state.entities.toArray()).toHaveLength(2)
    expect([...state.entities.all()]).toHaveLength(2)
    expect(state.entities.byType('vehicle')).toHaveLength(1)
    expect(state.entities.byType('static_obstacle')).toHaveLength(1)
  })

  it('exposes empty path/trajectory registries (Phase 3 limitation)', () => {
    const state = createReplayStateFromFrame(buildFrame({}), FIXED_DT)
    expect(state.paths.toArray()).toHaveLength(0)
    expect(state.trajectories.toArray()).toHaveLength(0)
  })

  it('falls back to dynamic actor position when pose is missing', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        entities: [
          {
            id: 'old-actor',
            kind: 'dynamic_actor',
            position: { x: 7, y: 8 },
          },
        ],
      }),
      FIXED_DT,
    )
    const actors = state.entities.byType<DynamicActorEntity>('dynamic_actor')
    expect(actors[0].pose.position.x).toBe(7)
    expect(actors[0].pose.position.y).toBe(8)
  })

  it('mirrors the metrics from the recorded frame', () => {
    const state = createReplayStateFromFrame(
      buildFrame({
        tick: 5,
        timeSec: 1,
        metrics: { collisionCount: 3, totalDistance: 2.5, peakSpeed: 0.7 },
      }),
      FIXED_DT,
    )
    expect(state.metrics.collisionCount).toBe(3)
    expect(state.metrics.totalDistance).toBeCloseTo(2.5)
    expect(state.metrics.peakSpeed).toBeCloseTo(0.7)
    expect(state.metrics.ticks).toBe(5)
  })
})
