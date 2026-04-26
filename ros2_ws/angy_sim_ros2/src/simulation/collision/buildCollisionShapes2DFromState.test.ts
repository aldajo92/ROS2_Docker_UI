import { describe, expect, it } from 'vitest'
import { buildCollisionShapes2DFromState } from './buildCollisionShapes2DFromState'
import { SimulationState } from '../core/SimulationState'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'

function makeState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

describe('buildCollisionShapes2DFromState', () => {
  it('returns an empty array when there are no entities', () => {
    expect(buildCollisionShapes2DFromState(makeState())).toEqual([])
  })

  it('maps a vehicle to a circle at its pose with its radius', () => {
    const state = makeState()
    state.entities.add(
      new VehicleEntity({ id: 'ego', pose: Pose2D.of(1, 2, 0), radius: 0.5 }),
    )
    const shapes = buildCollisionShapes2DFromState(state)
    expect(shapes).toEqual([
      {
        type: 'circle',
        entityId: 'ego',
        center: { x: 1, y: 2 },
        radius: 0.5,
      },
    ])
  })

  it('maps a static obstacle to a circle at its position with its radius', () => {
    const state = makeState()
    state.entities.add(
      new StaticObstacleEntity({
        id: 'rock',
        position: new Point2D(3, -1),
        radius: 0.7,
      }),
    )
    expect(buildCollisionShapes2DFromState(state)).toEqual([
      {
        type: 'circle',
        entityId: 'rock',
        center: { x: 3, y: -1 },
        radius: 0.7,
      },
    ])
  })

  it('maps a dynamic actor to a circle at its pose.position', () => {
    const state = makeState()
    state.entities.add(
      new DynamicActorEntity({
        id: 'ped',
        pose: Pose2D.of(-2, 0.25, 0),
        radius: 0.4,
      }),
    )
    expect(buildCollisionShapes2DFromState(state)).toEqual([
      {
        type: 'circle',
        entityId: 'ped',
        center: { x: -2, y: 0.25 },
        radius: 0.4,
      },
    ])
  })

  it('preserves entity insertion order', () => {
    const state = makeState()
    state.entities.add(
      new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), radius: 0.5 }),
    )
    state.entities.add(
      new StaticObstacleEntity({
        id: 'rock',
        position: new Point2D(1, 1),
        radius: 0.5,
      }),
    )
    state.entities.add(
      new DynamicActorEntity({ id: 'ped', pose: Pose2D.of(2, 2, 0), radius: 0.3 }),
    )
    const ids = buildCollisionShapes2DFromState(state).map((s) => s.entityId)
    expect(ids).toEqual(['ego', 'rock', 'ped'])
  })

  it('does not mutate entities', () => {
    const state = makeState()
    const ego = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(1, 2, 0.3),
      radius: 0.5,
    })
    state.entities.add(ego)
    buildCollisionShapes2DFromState(state)
    expect(ego.pose.position.x).toBe(1)
    expect(ego.pose.position.y).toBe(2)
    expect(ego.pose.yaw).toBeCloseTo(0.3)
    expect(ego.radius).toBe(0.5)
  })
})
