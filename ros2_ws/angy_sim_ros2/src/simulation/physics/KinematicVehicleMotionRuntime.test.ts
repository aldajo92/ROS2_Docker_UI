import { describe, expect, it, beforeEach } from 'vitest'
import { KinematicVehicleMotionRuntime } from './KinematicVehicleMotionRuntime'
import { VehicleEntity } from '../entities/VehicleEntity'
import { Pose2D } from '../../math/geometry/Pose2D'

describe('KinematicVehicleMotionRuntime', () => {
  let runtime: KinematicVehicleMotionRuntime

  beforeEach(() => {
    runtime = new KinematicVehicleMotionRuntime()
  })

  it('has name "kinematic"', () => {
    expect(runtime.name).toBe('kinematic')
  })

  it('drives straight along +X with zero yaw and forward velocity', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(0.5)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.x).toBeCloseTo(0.5)
    expect(s.pose.y).toBeCloseTo(0)
    expect(s.pose.yaw).toBeCloseTo(0)
    expect(s.distanceTraveled).toBeCloseTo(0.5)
  })

  it('rotates in place with pure angular velocity', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 0, w: Math.PI / 2 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.x).toBeCloseTo(0)
    expect(s.pose.y).toBeCloseTo(0)
    expect(s.pose.yaw).toBeCloseTo(Math.PI / 2)
    expect(s.distanceTraveled).toBe(0)
  })

  it('integrates yaw before translation (semi-implicit step)', () => {
    // Starting facing +X, apply w=π/2 and v=1 for 1s.
    // New heading = π/2, so translation is along +Y.
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: Math.PI / 2 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.yaw).toBeCloseTo(Math.PI / 2)
    expect(s.pose.x).toBeCloseTo(0, 6)
    expect(s.pose.y).toBeCloseTo(1, 6)
  })

  it('wraps yaw outside [-π, π]', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, Math.PI - 0.1), controls: { v: 0, w: 0.2 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(Math.abs(s.pose.yaw)).toBeLessThanOrEqual(Math.PI)
  })

  it('accumulates distanceTraveled from current entity value', () => {
    const v = new VehicleEntity({ id: 'ego', controls: { v: 2, w: 0 } })
    v.distanceTraveled = 5
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.distanceTraveled).toBeCloseTo(7)
  })

  it('distanceTraveled is non-negative for reverse motion', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: -1, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.distanceTraveled).toBeCloseTo(1)
  })

  it('exposes linear and angular velocity in state', () => {
    const v = new VehicleEntity({ id: 'ego', controls: { v: 0.7, w: -0.3 } })
    runtime.syncVehicles([v])
    runtime.step(0.1)
    const s = runtime.readVehicleState('ego')!
    expect(s.velocity.linear).toBeCloseTo(0.7)
    expect(s.velocity.angular).toBeCloseTo(-0.3)
  })

  it('steps multiple vehicles independently', () => {
    const a = new VehicleEntity({ id: 'a', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    const b = new VehicleEntity({ id: 'b', pose: Pose2D.of(10, 0, 0), controls: { v: 2, w: 0 } })
    runtime.syncVehicles([a, b])
    runtime.step(1.0)
    expect(runtime.readVehicleState('a')!.pose.x).toBeCloseTo(1)
    expect(runtime.readVehicleState('b')!.pose.x).toBeCloseTo(12)
  })

  it('does not mutate the vehicle entity during step', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(1, 2, 0.5), controls: { v: 1, w: 0 } })
    const xBefore = v.pose.position.x
    const yBefore = v.pose.position.y
    runtime.syncVehicles([v])
    runtime.step(1.0)
    expect(v.pose.position.x).toBe(xBefore)
    expect(v.pose.position.y).toBe(yBefore)
  })

  it('readVehicleState returns undefined for unknown id', () => {
    expect(runtime.readVehicleState('unknown')).toBeUndefined()
  })

  it('reset clears vehicles and stored states', () => {
    const v = new VehicleEntity({ id: 'ego', controls: { v: 1, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    runtime.reset()
    expect(runtime.readVehicleState('ego')).toBeUndefined()
    // After reset, step does nothing (no vehicles)
    runtime.step(1.0)
    expect(runtime.readVehicleState('ego')).toBeUndefined()
  })

  it('matches VehicleEntity.update() output exactly for the same inputs', () => {
    // Regression: the runtime must be numerically identical to the old direct path.
    const pose = Pose2D.of(3, -2, 1.1)
    const controls = { v: 0.8, w: 0.4 }
    const dt = 0.05

    // Reference: direct entity update
    const ref = new VehicleEntity({ id: 'ref', pose, controls })
    const fakeState = {} as never
    ref.update(dt, fakeState)

    // Runtime path
    const v = new VehicleEntity({ id: 'ego', pose, controls })
    runtime.syncVehicles([v])
    runtime.step(dt)
    const s = runtime.readVehicleState('ego')!

    expect(s.pose.x).toBeCloseTo(ref.pose.position.x, 10)
    expect(s.pose.y).toBeCloseTo(ref.pose.position.y, 10)
    expect(s.pose.yaw).toBeCloseTo(ref.pose.yaw, 10)
    expect(s.distanceTraveled).toBeCloseTo(ref.distanceTraveled, 10)
    expect(s.velocity.linear).toBeCloseTo(ref.v, 10)
    expect(s.velocity.angular).toBeCloseTo(ref.w, 10)
  })
})
