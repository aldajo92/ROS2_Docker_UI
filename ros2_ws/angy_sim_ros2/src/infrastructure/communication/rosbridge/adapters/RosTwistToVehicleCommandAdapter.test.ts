import { describe, expect, it } from 'vitest'
import { RosTwistToVehicleCommandAdapter } from './RosTwistToVehicleCommandAdapter'

const ZERO_VEC = { x: 0, y: 0, z: 0 }

describe('RosTwistToVehicleCommandAdapter', () => {
  it('maps linear.x → linearVelocity and angular.z → angularVelocity', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({ vehicleId: 'ego' })
    const cmd = adapter.toInternal({
      linear: { x: 1.5, y: 99, z: -3 },
      angular: { x: 7, y: 8, z: -0.3 },
    })

    expect(cmd).toEqual({
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: -0.3,
      source: 'external',
    })
  })

  it('defaults vehicleId to "ego" when not configured', () => {
    const adapter = new RosTwistToVehicleCommandAdapter()
    const cmd = adapter.toInternal({
      linear: { x: 0.5, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(cmd.vehicleId).toBe('ego')
  })

  it('routes to a custom vehicleId when configured', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({ vehicleId: 'rover-2' })
    const cmd = adapter.toInternal({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(cmd.vehicleId).toBe('rover-2')
  })

  it('always tags source as "external" so logs / replays know it came from a transport', () => {
    const adapter = new RosTwistToVehicleCommandAdapter()
    const cmd = adapter.toInternal({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(cmd.source).toBe('external')
  })

  it('rejects an empty vehicleId at construction', () => {
    expect(() => new RosTwistToVehicleCommandAdapter({ vehicleId: '' })).toThrow(
      /vehicleId/,
    )
  })

  it('rejects non-object messages', () => {
    const adapter = new RosTwistToVehicleCommandAdapter()
    expect(() => adapter.toInternal(null)).toThrow()
    expect(() => adapter.toInternal('twist')).toThrow()
    expect(() => adapter.toInternal(42)).toThrow()
  })

  it('rejects messages with missing or non-finite Vector3 fields', () => {
    const adapter = new RosTwistToVehicleCommandAdapter()

    expect(() =>
      adapter.toInternal({ linear: { x: 1, y: 0, z: 0 } }),
    ).toThrow(/angular/)

    expect(() =>
      adapter.toInternal({
        linear: { x: Number.NaN, y: 0, z: 0 },
        angular: ZERO_VEC,
      }),
    ).toThrow(/linear\.x/)

    expect(() =>
      adapter.toInternal({
        linear: ZERO_VEC,
        angular: { x: 0, y: 0, z: Number.POSITIVE_INFINITY },
      }),
    ).toThrow(/angular\.z/)

    expect(() =>
      adapter.toInternal({
        linear: { x: '1' as unknown as number, y: 0, z: 0 },
        angular: ZERO_VEC,
      }),
    ).toThrow(/linear\.x/)
  })

  it('round-trips an internal command through fromInternal → toInternal (lossy on sim-only fields)', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({ vehicleId: 'ego' })

    const wire = adapter.fromInternal({
      vehicleId: 'ego',
      linearVelocity: 2.0,
      angularVelocity: -0.5,
      throttle: 0.8, // dropped intentionally — Twist has nowhere to put it
      source: 'planner',
    })

    expect(wire).toEqual({
      linear: { x: 2.0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: -0.5 },
    })

    const decoded = adapter.toInternal(wire)
    expect(decoded.linearVelocity).toBeCloseTo(2.0)
    expect(decoded.angularVelocity).toBeCloseTo(-0.5)
    expect(decoded.vehicleId).toBe('ego')
    expect(decoded.source).toBe('external')
    // Lossy fields are NOT preserved — Twist carries no slot for them.
    expect(decoded.throttle).toBeUndefined()
  })

  it('fromInternal treats undefined velocities as zero', () => {
    const adapter = new RosTwistToVehicleCommandAdapter()
    const wire = adapter.fromInternal({ vehicleId: 'ego' })
    expect(wire).toEqual({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
  })

  it('fromInternal rejects non-finite numeric inputs', () => {
    const adapter = new RosTwistToVehicleCommandAdapter()
    expect(() =>
      adapter.fromInternal({ vehicleId: 'ego', linearVelocity: Number.NaN }),
    ).toThrow(/linearVelocity/)
    expect(() =>
      adapter.fromInternal({
        vehicleId: 'ego',
        angularVelocity: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/angularVelocity/)
  })
})

describe('RosTwistToVehicleCommandAdapter — scale', () => {
  it('multiplies linear.x by scale.v', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      scale: { v: 2 },
    })
    const cmd = adapter.toInternal({
      linear: { x: 1, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(cmd.linearVelocity).toBe(2)
    expect(cmd.angularVelocity).toBe(0)
  })

  it('multiplies angular.z by scale.w', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      scale: { w: 0.5 },
    })
    const cmd = adapter.toInternal({
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 1 },
    })
    expect(cmd.angularVelocity).toBe(0.5)
  })

  it('defaults to scale 1 when no scale option is provided', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({ vehicleId: 'ego' })
    const cmd = adapter.toInternal({
      linear: { x: 1.5, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: -0.25 },
    })
    expect(cmd.linearVelocity).toBe(1.5)
    expect(cmd.angularVelocity).toBe(-0.25)
  })

  it('rejects non-finite scale at construction', () => {
    expect(
      () =>
        new RosTwistToVehicleCommandAdapter({
          vehicleId: 'ego',
          scale: { v: Number.NaN },
        }),
    ).toThrow(/scale\.v/)
  })
})

describe('RosTwistToVehicleCommandAdapter — limits', () => {
  it('clamps positive linear velocity to maxForwardSpeed', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      limits: { maxForwardSpeed: 1.5 },
    })
    const cmd = adapter.toInternal({
      linear: { x: 5, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(cmd.linearVelocity).toBe(1.5)
  })

  it('clamps negative linear velocity to -maxReverseSpeed', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      limits: { maxReverseSpeed: 0.8 },
    })
    const cmd = adapter.toInternal({
      linear: { x: -3, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(cmd.linearVelocity).toBe(-0.8)
  })

  it('clamps |w| to maxAngularSpeed in both directions', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      limits: { maxAngularSpeed: 0.5 },
    })
    expect(
      adapter.toInternal({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 5 },
      }).angularVelocity,
    ).toBe(0.5)
    expect(
      adapter.toInternal({
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: -5 },
      }).angularVelocity,
    ).toBe(-0.5)
  })

  it('applies limits AFTER scale (so scaled values can still get clamped)', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      scale: { v: 10 },
      limits: { maxForwardSpeed: 2 },
    })
    const cmd = adapter.toInternal({
      linear: { x: 1, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    // Without clamping: 1 * 10 = 10. Clamped: 2.
    expect(cmd.linearVelocity).toBe(2)
  })

  it('rejects non-positive limits at construction', () => {
    expect(
      () =>
        new RosTwistToVehicleCommandAdapter({
          vehicleId: 'ego',
          limits: { maxForwardSpeed: 0 },
        }),
    ).toThrow(/maxForwardSpeed/)
    expect(
      () =>
        new RosTwistToVehicleCommandAdapter({
          vehicleId: 'ego',
          limits: { maxAngularSpeed: -1 },
        }),
    ).toThrow(/maxAngularSpeed/)
  })

  it('skips clamping for axes with no limit configured', () => {
    const adapter = new RosTwistToVehicleCommandAdapter({
      vehicleId: 'ego',
      limits: { maxAngularSpeed: 1 },
    })
    const cmd = adapter.toInternal({
      linear: { x: 100, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0.5 },
    })
    // No linear clamp configured → passes through unchanged.
    expect(cmd.linearVelocity).toBe(100)
    expect(cmd.angularVelocity).toBe(0.5)
  })
})
