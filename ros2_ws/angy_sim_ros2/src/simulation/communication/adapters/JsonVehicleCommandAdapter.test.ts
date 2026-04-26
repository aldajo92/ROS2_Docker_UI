import { describe, expect, it } from 'vitest'
import { JsonVehicleCommandAdapter } from './JsonVehicleCommandAdapter'

describe('JsonVehicleCommandAdapter', () => {
  const adapter = new JsonVehicleCommandAdapter()

  it('round-trips a fully-populated command', () => {
    const internal = {
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: -0.3,
      throttle: 0.5,
      brake: 0.0,
      steering: 0.1,
    }
    const external = adapter.fromInternal(internal)
    expect(adapter.toInternal(external)).toEqual(internal)
  })

  it('preserves omitted fields as undefined', () => {
    const result = adapter.toInternal({ vehicleId: 'ego', linearVelocity: 0.5 })
    expect(result).toEqual({
      vehicleId: 'ego',
      linearVelocity: 0.5,
      angularVelocity: undefined,
      throttle: undefined,
      brake: undefined,
      steering: undefined,
    })
  })

  it('rejects non-object messages', () => {
    expect(() => adapter.toInternal(null)).toThrow()
    expect(() => adapter.toInternal('hello')).toThrow()
    expect(() => adapter.toInternal(42)).toThrow()
  })

  it('rejects messages missing vehicleId', () => {
    expect(() => adapter.toInternal({ linearVelocity: 1 })).toThrow(/vehicleId/)
    expect(() =>
      adapter.toInternal({ vehicleId: '', linearVelocity: 1 }),
    ).toThrow(/vehicleId/)
  })

  it('rejects non-finite numeric fields', () => {
    expect(() =>
      adapter.toInternal({ vehicleId: 'ego', linearVelocity: Number.NaN }),
    ).toThrow(/linearVelocity/)
    expect(() =>
      adapter.toInternal({
        vehicleId: 'ego',
        angularVelocity: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/angularVelocity/)
    expect(() =>
      adapter.toInternal({ vehicleId: 'ego', throttle: '0.5' }),
    ).toThrow(/throttle/)
  })
})
