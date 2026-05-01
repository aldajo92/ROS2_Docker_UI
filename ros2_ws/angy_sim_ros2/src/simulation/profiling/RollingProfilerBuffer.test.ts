import { describe, expect, it } from 'vitest'
import { RollingProfilerBuffer } from './RollingProfilerBuffer'
import type { TickTimingSample } from './ProfilerTypes'

function makeSample(
  tickIndex: number,
  totalDurationMs: number,
  systems: Array<{ name: string; durationMs: number }> = [],
  wallClockStartMs = tickIndex,
): TickTimingSample {
  return {
    tickIndex,
    simDtSec: 1 / 60,
    totalDurationMs,
    systems,
    wallClockStartMs,
    wallClockEndMs: wallClockStartMs + totalDurationMs,
  }
}

describe('RollingProfilerBuffer', () => {
  it('starts empty with the requested capacity', () => {
    const buf = new RollingProfilerBuffer(10)
    expect(buf.size()).toBe(0)
    expect(buf.latest()).toBeUndefined()
    expect(buf.getCapacity()).toBe(10)
  })

  it('clamps non-finite / sub-1 capacities to 1', () => {
    expect(new RollingProfilerBuffer(0).getCapacity()).toBe(1)
    expect(new RollingProfilerBuffer(-5).getCapacity()).toBe(1)
    expect(new RollingProfilerBuffer(NaN).getCapacity()).toBe(1)
    expect(new RollingProfilerBuffer(1.8).getCapacity()).toBe(1)
  })

  it('evicts oldest entries once past capacity (FIFO)', () => {
    const buf = new RollingProfilerBuffer(3)
    buf.push(makeSample(1, 1))
    buf.push(makeSample(2, 2))
    buf.push(makeSample(3, 3))
    buf.push(makeSample(4, 4))
    expect(buf.size()).toBe(3)
    expect(buf.toArray().map((s) => s.tickIndex)).toEqual([2, 3, 4])
    expect(buf.latest()?.tickIndex).toBe(4)
  })

  it('setCapacity trims oldest when shrinking', () => {
    const buf = new RollingProfilerBuffer(5)
    for (let i = 1; i <= 5; i++) buf.push(makeSample(i, i))
    buf.setCapacity(2)
    expect(buf.size()).toBe(2)
    expect(buf.toArray().map((s) => s.tickIndex)).toEqual([4, 5])
  })

  it('snapshot of empty buffer yields zero aggregates', () => {
    const snap = new RollingProfilerBuffer().snapshot()
    expect(snap.latest).toBeUndefined()
    expect(snap.tick.sampleCount).toBe(0)
    expect(snap.tick.avgMs).toBe(0)
    expect(snap.perSystem).toEqual({})
    expect(snap.ticksPerSec).toBe(0)
    expect(snap.historyMs).toEqual([])
  })

  it('snapshot computes tick avg/min/max across retained samples', () => {
    const buf = new RollingProfilerBuffer()
    buf.push(makeSample(1, 2))
    buf.push(makeSample(2, 4))
    buf.push(makeSample(3, 6))
    const snap = buf.snapshot()
    expect(snap.tick.sampleCount).toBe(3)
    expect(snap.tick.avgMs).toBeCloseTo(4, 10)
    expect(snap.tick.minMs).toBe(2)
    expect(snap.tick.maxMs).toBe(6)
    expect(snap.historyMs).toEqual([2, 4, 6])
  })

  it('snapshot computes per-system aggregates keyed by name', () => {
    const buf = new RollingProfilerBuffer()
    buf.push(
      makeSample(1, 3, [
        { name: 'a', durationMs: 1 },
        { name: 'b', durationMs: 2 },
      ]),
    )
    buf.push(
      makeSample(2, 5, [
        { name: 'a', durationMs: 3 },
        { name: 'b', durationMs: 2 },
      ]),
    )
    const { perSystem } = buf.snapshot()
    expect(Object.keys(perSystem).sort()).toEqual(['a', 'b'])
    expect(perSystem.a.sampleCount).toBe(2)
    expect(perSystem.a.avgMs).toBeCloseTo(2, 10)
    expect(perSystem.a.minMs).toBe(1)
    expect(perSystem.a.maxMs).toBe(3)
    expect(perSystem.b.avgMs).toBeCloseTo(2, 10)
  })

  it('ticksPerSec estimates rate from wall-clock deltas', () => {
    const buf = new RollingProfilerBuffer()
    // 10 samples, 10 ms apart -> 100 ticks/sec
    for (let i = 0; i < 10; i++) {
      buf.push(makeSample(i + 1, 1, [], i * 10))
    }
    const { ticksPerSec } = buf.snapshot()
    expect(ticksPerSec).toBeCloseTo(100, 5)
  })

  it('ticksPerSec is 0 for a single sample', () => {
    const buf = new RollingProfilerBuffer()
    buf.push(makeSample(1, 1))
    expect(buf.snapshot().ticksPerSec).toBe(0)
  })

  it('clear resets contents', () => {
    const buf = new RollingProfilerBuffer()
    buf.push(makeSample(1, 1))
    buf.push(makeSample(2, 1))
    buf.clear()
    expect(buf.size()).toBe(0)
    expect(buf.snapshot().historyMs).toEqual([])
  })
})
