import { describe, expect, it } from 'vitest'
import { SimulationClock } from './SimulationClock'

describe('SimulationClock', () => {
  it('starts at 0 by default with dt=0', () => {
    const clock = new SimulationClock()
    expect(clock.time()).toBe(0)
    expect(clock.dt()).toBe(0)
  })

  it('respects an explicit initial time', () => {
    const clock = new SimulationClock(5.5)
    expect(clock.time()).toBe(5.5)
  })

  it('accumulates time and remembers the last dt', () => {
    const clock = new SimulationClock()
    clock.tick(0.1)
    clock.tick(0.2)
    clock.tick(0.05)
    expect(clock.time()).toBeCloseTo(0.35, 10)
    expect(clock.dt()).toBeCloseTo(0.05)
  })

  it('reset() returns to zero', () => {
    const clock = new SimulationClock()
    clock.tick(0.5)
    clock.tick(0.5)
    clock.reset()
    expect(clock.time()).toBe(0)
    expect(clock.dt()).toBe(0)
  })

  it('reset(t) returns to a chosen time', () => {
    const clock = new SimulationClock()
    clock.tick(1)
    clock.reset(10)
    expect(clock.time()).toBe(10)
    expect(clock.dt()).toBe(0)
  })

  it('rejects non-finite or negative dt', () => {
    const clock = new SimulationClock()
    expect(() => clock.tick(NaN)).toThrow()
    expect(() => clock.tick(Infinity)).toThrow()
    expect(() => clock.tick(-0.1)).toThrow()
  })

  it('zero-dt tick is allowed (idle frame)', () => {
    const clock = new SimulationClock()
    clock.tick(0.1)
    clock.tick(0)
    expect(clock.time()).toBeCloseTo(0.1)
    expect(clock.dt()).toBe(0)
  })
})
