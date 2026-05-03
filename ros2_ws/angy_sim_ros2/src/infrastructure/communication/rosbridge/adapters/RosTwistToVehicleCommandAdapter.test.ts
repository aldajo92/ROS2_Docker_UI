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
