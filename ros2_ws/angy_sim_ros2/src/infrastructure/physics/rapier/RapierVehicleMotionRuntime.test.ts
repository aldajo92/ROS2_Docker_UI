import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { RapierVehicleMotionRuntime } from './RapierVehicleMotionRuntime'
import { VehicleEntity } from '../../../simulation/entities/VehicleEntity'
import { Pose2D } from '../../../math/geometry/Pose2D'

let runtime: RapierVehicleMotionRuntime

beforeAll(async () => {
  runtime = await RapierVehicleMotionRuntime.create()
})

beforeEach(() => {
  runtime.reset()
})

describe('RapierVehicleMotionRuntime', () => {
  it('has name "rapier"', () => {
    expect(runtime.name).toBe('rapier')
  })

  it('drives forward: pose.x increases for v>0 at yaw=0', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.x).toBeGreaterThan(0)
    expect(s.pose.y).toBeCloseTo(0, 3)
  })

  it('rotates in place: yaw changes for w>0', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 0, w: 1 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.yaw).toBeGreaterThan(0)
    expect(s.pose.x).toBeCloseTo(0, 3)
  })

  it('pose change is proportional to dt', () => {
    const a = new VehicleEntity({ id: 'a', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    const b = new VehicleEntity({ id: 'b', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })

    runtime.syncVehicles([a])
    runtime.step(0.5)
    const shortStep = runtime.readVehicleState('a')!.pose.x

    runtime.reset()
    runtime.syncVehicles([b])
    runtime.step(1.0)
    const longStep = runtime.readVehicleState('b')!.pose.x

    expect(longStep).toBeCloseTo(shortStep * 2, 3)
  })

  it('accumulates distanceTraveled from vehicle base value', () => {
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
    expect(s.distanceTraveled).toBeGreaterThanOrEqual(0)
  })

  it('exposes commanded velocity in state', () => {
    const v = new VehicleEntity({ id: 'ego', controls: { v: 0.7, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(0.1)
    const s = runtime.readVehicleState('ego')!
    expect(s.velocity.linear).toBeCloseTo(0.7)
  })

  it('steps multiple vehicles independently', () => {
    const a = new VehicleEntity({ id: 'a', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    const b = new VehicleEntity({ id: 'b', pose: Pose2D.of(10, 0, 0), controls: { v: 2, w: 0 } })
    runtime.syncVehicles([a, b])
    runtime.step(1.0)
    const sa = runtime.readVehicleState('a')!
    const sb = runtime.readVehicleState('b')!
    expect(sb.pose.x).toBeGreaterThan(sa.pose.x)
  })

  it('readVehicleState returns undefined for unknown id', () => {
    expect(runtime.readVehicleState('unknown')).toBeUndefined()
  })

  it('reset clears all bodies and states', () => {
    const v = new VehicleEntity({ id: 'ego', controls: { v: 1, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    expect(runtime.readVehicleState('ego')).toBeDefined()

    runtime.reset()
    expect(runtime.readVehicleState('ego')).toBeUndefined()

    // After reset, step produces nothing (no vehicles)
    runtime.step(1.0)
    expect(runtime.readVehicleState('ego')).toBeUndefined()
  })

  it('syncVehicles removes body for disappeared vehicle', () => {
    const a = new VehicleEntity({ id: 'a', controls: { v: 1, w: 0 } })
    const b = new VehicleEntity({ id: 'b', controls: { v: 1, w: 0 } })
    runtime.syncVehicles([a, b])
    runtime.step(0.1)
    expect(runtime.readVehicleState('a')).toBeDefined()
    expect(runtime.readVehicleState('b')).toBeDefined()

    // Remove 'b' from active set
    runtime.syncVehicles([a])
    runtime.step(0.1)
    expect(runtime.readVehicleState('a')).toBeDefined()
    expect(runtime.readVehicleState('b')).toBeUndefined()
  })

  it('new vehicle added mid-simulation gets a fresh body', () => {
    const a = new VehicleEntity({ id: 'a', controls: { v: 1, w: 0 } })
    runtime.syncVehicles([a])
    runtime.step(0.5)

    // Add a second vehicle at a different pose
    const b = new VehicleEntity({ id: 'b', pose: Pose2D.of(5, 0, 0), controls: { v: 1, w: 0 } })
    runtime.syncVehicles([a, b])
    runtime.step(0.5)

    const sb = runtime.readVehicleState('b')!
    expect(sb.pose.x).toBeGreaterThan(5)
  })
})
