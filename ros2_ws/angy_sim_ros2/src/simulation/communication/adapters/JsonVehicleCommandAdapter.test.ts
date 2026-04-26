import { describe, expect, it } from 'vitest'
import { JsonVehicleCommandAdapter } from './JsonVehicleCommandAdapter'
import type { VehicleCommand } from '../../commands/VehicleCommand'

describe('JsonVehicleCommandAdapter', () => {
  const adapter = new JsonVehicleCommandAdapter()

  it('round-trips a fully-populated command including source / timestamp', () => {
    const internal: VehicleCommand = {
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: -0.3,
      throttle: 0.5,
      brake: 0.0,
      steering: 0.1,
      timestampSec: 12.0,
      source: 'planner',
    }
    const external = adapter.fromInternal(internal)
    expect(adapter.toInternal(external)).toEqual(internal)
  })

  it('defaults source to "external" when omitted', () => {
    const result = adapter.toInternal({ vehicleId: 'ego', linearVelocity: 0.5 })
    expect(result.source).toBe('external')
  })

  it('preserves omitted optional fields as undefined', () => {
    const result = adapter.toInternal({ vehicleId: 'ego', linearVelocity: 0.5 })
    expect(result).toEqual({
      vehicleId: 'ego',
      linearVelocity: 0.5,
      angularVelocity: undefined,
      throttle: undefined,
      brake: undefined,
      steering: undefined,
      timestampSec: undefined,
      source: 'external',
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
    expect(() =>
      adapter.toInternal({ vehicleId: 'ego', timestampSec: Number.NaN }),
    ).toThrow(/timestampSec/)
  })

  it('rejects unknown source tags rather than silently remapping', () => {
    expect(() =>
      adapter.toInternal({ vehicleId: 'ego', source: 'mystery' }),
    ).toThrow(/source/)
  })

  it('accepts every documented source tag', () => {
    for (const src of [
      'keyboard',
      'external',
      'scenario',
      'planner',
      'unknown',
    ] as const) {
      const r = adapter.toInternal({ vehicleId: 'ego', source: src })
      expect(r.source).toBe(src)
    }
  })
})
