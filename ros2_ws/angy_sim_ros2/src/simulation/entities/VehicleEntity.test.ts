import { describe, expect, it } from 'vitest'
import { Pose2D } from '../../math/geometry/Pose2D'
import { VehicleEntity } from './VehicleEntity'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { SimulationState } from '../core/SimulationState'

function makeState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

describe('VehicleEntity (unicycle kinematic model)', () => {
  it('drives straight along +X with zero yaw and pure forward velocity', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: 0 },
    })
    const state = makeState()

    v.update(0.5, state)
    expect(v.pose.position.x).toBeCloseTo(0.5)
    expect(v.pose.position.y).toBeCloseTo(0)
    expect(v.pose.yaw).toBeCloseTo(0)
    expect(v.distanceTraveled).toBeCloseTo(0.5)

    v.update(0.5, state)
    expect(v.pose.position.x).toBeCloseTo(1.0)
    expect(v.distanceTraveled).toBeCloseTo(1.0)
  })

  it('rotates in place with pure angular velocity', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 0, w: Math.PI / 2 }, // 90°/s
    })
    const state = makeState()

    v.update(1.0, state) // → 90°
    expect(v.pose.position.x).toBeCloseTo(0)
    expect(v.pose.position.y).toBeCloseTo(0)
    expect(v.pose.yaw).toBeCloseTo(Math.PI / 2)
    expect(v.distanceTraveled).toBe(0)
  })

  it('integrates yaw before translation (semi-implicit step)', () => {
    // Starting facing +X, apply w=π/2 rad/s and v=1 m/s for 1s.
    // Expected: yaw advances to π/2 first, then position moves along
    // the *new* heading → position is (0, 1), not (1, 0).
    const v = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: Math.PI / 2 },
    })
    const state = makeState()

    v.update(1.0, state)
    expect(v.pose.yaw).toBeCloseTo(Math.PI / 2)
    expect(v.pose.position.x).toBeCloseTo(0, 6)
    expect(v.pose.position.y).toBeCloseTo(1, 6)
  })

  it('honors setControls() between updates', () => {
    const v = new VehicleEntity({
      id: 'ego',
      controls: { v: 1, w: 0 },
    })
    const state = makeState()

    v.update(1, state)
    expect(v.pose.position.x).toBeCloseTo(1)

    v.setControls({ v: 0, w: 0 })
    v.update(1, state)
    expect(v.pose.position.x).toBeCloseTo(1)
    expect(v.distanceTraveled).toBeCloseTo(1)
  })

  it('updates exposed v / w telemetry to match last-applied controls', () => {
    const v = new VehicleEntity({
      id: 'ego',
      controls: { v: 0.7, w: -0.3 },
    })
    const state = makeState()
    v.update(0.1, state)
    expect(v.v).toBeCloseTo(0.7)
    expect(v.w).toBeCloseTo(-0.3)
  })

  it('reverse motion is allowed but distanceTraveled is non-negative', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: -1, w: 0 },
    })
    const state = makeState()
    v.update(1, state)
    expect(v.pose.position.x).toBeCloseTo(-1)
    expect(v.distanceTraveled).toBeCloseTo(1)
  })
})
