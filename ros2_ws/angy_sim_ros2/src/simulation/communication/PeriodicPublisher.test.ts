import { describe, expect, it, vi } from 'vitest'
import { PeriodicPublisher } from './PeriodicPublisher'

describe('PeriodicPublisher', () => {
  it('rejects non-positive periods', () => {
    expect(() => new PeriodicPublisher(0, () => {})).toThrow()
    expect(() => new PeriodicPublisher(-0.01, () => {})).toThrow()
    expect(() => new PeriodicPublisher(Number.NaN, () => {})).toThrow()
  })

  it('rejects negative or non-finite dt values', () => {
    const pub = new PeriodicPublisher(0.1, () => {})
    expect(() => pub.update(-0.01)).toThrow()
    expect(() => pub.update(Number.NaN)).toThrow()
  })

  it('fires once per accumulated period', () => {
    const cb = vi.fn()
    const pub = new PeriodicPublisher(0.1, cb)

    pub.update(0.04)
    expect(cb).toHaveBeenCalledTimes(0)

    pub.update(0.04)
    expect(cb).toHaveBeenCalledTimes(0)

    pub.update(0.03) // crosses 0.1
    expect(cb).toHaveBeenCalledTimes(1)

    pub.update(0.10) // crosses again
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('drops missed periods when given an unusually large dt', () => {
    // We deliberately fire only once per `update` so a manual
    // `step(0.5)` at 10Hz cadence does not flood the bus.
    const cb = vi.fn()
    const pub = new PeriodicPublisher(0.1, cb)

    pub.update(1.0)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('reset() clears the accumulator', () => {
    const cb = vi.fn()
    const pub = new PeriodicPublisher(0.1, cb)

    pub.update(0.09)
    pub.reset()
    pub.update(0.05) // would have fired without reset; now must not
    expect(cb).toHaveBeenCalledTimes(0)

    pub.update(0.06) // total since reset = 0.11
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('detaches publish() promise so a slow callback does not block update()', async () => {
    let resolved = false
    const slow = () =>
      new Promise<void>((r) =>
        setTimeout(() => {
          resolved = true
          r()
        }, 5),
      )
    const pub = new PeriodicPublisher(0.1, slow)

    pub.update(0.1) // schedules slow callback but returns immediately
    expect(resolved).toBe(false)

    await new Promise((r) => setTimeout(r, 20))
    expect(resolved).toBe(true)
  })
})
