import { describe, expect, it } from 'vitest'
import { SimClockToRosClockAdapter } from './SimClockToRosClockAdapter'

describe('SimClockToRosClockAdapter', () => {
  const adapter = new SimClockToRosClockAdapter()

  it('encodes integer seconds with zero nanoseconds', () => {
    expect(adapter.fromInternal({ timeSec: 0, dtSec: 0, tick: 0 })).toEqual({
      clock: { sec: 0, nanosec: 0 },
    })
    expect(adapter.fromInternal({ timeSec: 12, dtSec: 0, tick: 0 })).toEqual({
      clock: { sec: 12, nanosec: 0 },
    })
  })

  it('splits a fractional second into sec + nanosec', () => {
    expect(adapter.fromInternal({ timeSec: 12.5, dtSec: 0, tick: 0 })).toEqual({
      clock: { sec: 12, nanosec: 500_000_000 },
    })
    expect(
      adapter.fromInternal({ timeSec: 1.234, dtSec: 0, tick: 0 }),
    ).toEqual({ clock: { sec: 1, nanosec: 234_000_000 } })
  })

  it('handles negative times by sign-extending sec while keeping nanosec in [0, 1e9)', () => {
    expect(adapter.fromInternal({ timeSec: -0.25, dtSec: 0, tick: 0 })).toEqual(
      { clock: { sec: -1, nanosec: 750_000_000 } },
    )
    expect(adapter.fromInternal({ timeSec: -1, dtSec: 0, tick: 0 })).toEqual({
      clock: { sec: -1, nanosec: 0 },
    })
  })

  it('decodes a Clock body back into seconds', () => {
    const decoded = adapter.toInternal({
      clock: { sec: 12, nanosec: 500_000_000 },
    })
    expect(decoded.timeSec).toBeCloseTo(12.5)
    expect(decoded.dtSec).toBe(0)
    expect(decoded.tick).toBe(0)
  })

  it('round-trips simple values exactly', () => {
    for (const t of [0, 1, 12, 0.5, 1.234, 123.456, 999.999]) {
      const wire = adapter.fromInternal({ timeSec: t, dtSec: 0, tick: 0 })
      const back = adapter.toInternal(wire)
      expect(back.timeSec).toBeCloseTo(t, 9)
    }
  })

  it('round-trips negative values exactly', () => {
    for (const t of [-0.25, -1, -1.5, -10.001]) {
      const wire = adapter.fromInternal({ timeSec: t, dtSec: 0, tick: 0 })
      const back = adapter.toInternal(wire)
      expect(back.timeSec).toBeCloseTo(t, 9)
    }
  })

  it('rejects non-finite timeSec', () => {
    expect(() =>
      adapter.fromInternal({ timeSec: Number.NaN, dtSec: 0, tick: 0 }),
    ).toThrow(/timeSec/)
    expect(() =>
      adapter.fromInternal({
        timeSec: Number.POSITIVE_INFINITY,
        dtSec: 0,
        tick: 0,
      }),
    ).toThrow(/timeSec/)
  })

  it('rejects malformed inbound payloads', () => {
    expect(() => adapter.toInternal(null)).toThrow()
    expect(() => adapter.toInternal({})).toThrow(/clock/)
    expect(() => adapter.toInternal({ clock: 42 })).toThrow(/clock/)
    expect(() =>
      adapter.toInternal({ clock: { sec: 0.5, nanosec: 0 } }),
    ).toThrow(/clock\.sec/)
    expect(() =>
      adapter.toInternal({ clock: { sec: 0, nanosec: -1 } }),
    ).toThrow(/clock\.nanosec/)
    expect(() =>
      adapter.toInternal({ clock: { sec: 0, nanosec: 1_000_000_000 } }),
    ).toThrow(/clock\.nanosec/)
    expect(() =>
      adapter.toInternal({ clock: { sec: 'a', nanosec: 0 } }),
    ).toThrow(/clock\.sec/)
  })
})
