import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Rapier3DVehicleMotionRuntime } from './Rapier3DVehicleMotionRuntime'
import { VehicleEntity } from '../../../simulation/entities/VehicleEntity'
import { Pose2D } from '../../../math/geometry/Pose2D'

let runtime: Rapier3DVehicleMotionRuntime

beforeAll(async () => {
  runtime = await Rapier3DVehicleMotionRuntime.create()
})

beforeEach(() => {
  runtime.reset()
})

describe('Rapier3DVehicleMotionRuntime', () => {
  it('has name "rapier3d"', () => {
    expect(runtime.name).toBe('rapier3d')
  })

  // ── additive design proof: the 2D kinematic baseline is untouched ─────────

  it('is a separate instance from the existing Rapier 2D runtime (additive, not replacement)', async () => {
    const { RapierVehicleMotionRuntime } = await import(
      '../rapier/RapierVehicleMotionRuntime'
    )
    const rapier2d = await RapierVehicleMotionRuntime.create()
    try {
      expect(rapier2d.name).toBe('rapier')
      expect(runtime.name).toBe('rapier3d')
      expect(rapier2d).not.toBe(runtime)
    } finally {
      rapier2d.dispose?.()
    }
  })

  // ── ground-plane kinematics ───────────────────────────────────────────────

  it('drives forward: pose.x increases for v>0 at yaw=0', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.x).toBeGreaterThan(0)
    expect(s.pose.y).toBeCloseTo(0, 3)
  })

  it('drives left: pose.y increases for v>0 at yaw=π/2', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, Math.PI / 2),
      controls: { v: 1, w: 0 },
    })
    runtime.syncVehicles([v])
    runtime.step(1.0)
    const s = runtime.readVehicleState('ego')!
    expect(s.pose.y).toBeGreaterThan(0)
    expect(s.pose.x).toBeCloseTo(0, 2)
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

  // ── state shape ───────────────────────────────────────────────────────────

  it('VehicleRuntimeState has the expected 2D shape (compatible with existing renderers)', () => {
    const v = new VehicleEntity({ id: 'ego', pose: Pose2D.of(1, 2, 0.5), controls: { v: 0, w: 0 } })
    runtime.syncVehicles([v])
    runtime.step(0.01)
    const s = runtime.readVehicleState('ego')!
    expect(typeof s.pose.x).toBe('number')
    expect(typeof s.pose.y).toBe('number')
    expect(typeof s.pose.yaw).toBe('number')
    expect(typeof s.velocity.linear).toBe('number')
    expect(typeof s.velocity.angular).toBe('number')
    expect(typeof s.distanceTraveled).toBe('number')
    // No 3D-specific fields bleed through the contract
    expect((s.pose as Record<string, unknown>).z).toBeUndefined()
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

  // ── multi-vehicle ─────────────────────────────────────────────────────────

  it('steps multiple vehicles independently', () => {
    const a = new VehicleEntity({ id: 'a', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
    const b = new VehicleEntity({ id: 'b', pose: Pose2D.of(10, 0, 0), controls: { v: 2, w: 0 } })
    runtime.syncVehicles([a, b])
    runtime.step(1.0)
    const sa = runtime.readVehicleState('a')!
    const sb = runtime.readVehicleState('b')!
    expect(sb.pose.x).toBeGreaterThan(sa.pose.x)
  })

  // ── lifecycle ─────────────────────────────────────────────────────────────

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

    runtime.syncVehicles([a])
    runtime.step(0.1)
    expect(runtime.readVehicleState('a')).toBeDefined()
    expect(runtime.readVehicleState('b')).toBeUndefined()
  })

  it('new vehicle added mid-simulation gets a fresh body seeded from its pose', () => {
    const a = new VehicleEntity({ id: 'a', controls: { v: 1, w: 0 } })
    runtime.syncVehicles([a])
    runtime.step(0.5)

    const b = new VehicleEntity({ id: 'b', pose: Pose2D.of(5, 0, 0), controls: { v: 1, w: 0 } })
    runtime.syncVehicles([a, b])
    runtime.step(0.5)

    const sb = runtime.readVehicleState('b')!
    expect(sb.pose.x).toBeGreaterThan(5)
  })

  it('dispose() is idempotent', async () => {
    // Use a dedicated instance so the shared `runtime` singleton is not freed.
    const disposable = await Rapier3DVehicleMotionRuntime.create()
    expect(() => {
      disposable.dispose?.()
      disposable.dispose?.()
    }).not.toThrow()
  })
})

describe('Rapier3DVehicleMotionRuntime factory', () => {
  it('create() returns a new instance each time (separate engines)', async () => {
    const a = await Rapier3DVehicleMotionRuntime.create()
    const b = await Rapier3DVehicleMotionRuntime.create()
    try {
      expect(a).not.toBe(b)
      expect(a.name).toBe('rapier3d')
    } finally {
      a.dispose?.()
      b.dispose?.()
    }
  })
})
