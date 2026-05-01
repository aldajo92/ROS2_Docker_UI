import { describe, expect, it } from 'vitest'
import { SimulationProfiler } from './SimulationProfiler'

/**
 * Build a deterministic `nowMs` that returns the supplied values in
 * order. Used to feed known wall-clock deltas into the profiler so we
 * can assert exact durations without flakiness.
 */
function sequenceNow(values: readonly number[]): () => number {
  let i = 0
  return () => {
    if (i >= values.length) {
      throw new Error(
        `sequenceNow: ran past end of provided values (asked for ${i})`,
      )
    }
    return values[i++]
  }
}

describe('SimulationProfiler', () => {
  it('is enabled by default with default capacity', () => {
    const p = new SimulationProfiler({ nowMs: () => 0 })
    expect(p.isEnabled()).toBe(true)
    expect(p.getHistoryCapacity()).toBeGreaterThan(0)
  })

  it('captures per-system and total durations deterministically', () => {
    // Sequence drives: tickStart, sysA start, sysA end, sysB start,
    // sysB end, tickEnd.
    const p = new SimulationProfiler({
      nowMs: sequenceNow([100, 101, 104, 104, 110, 112]),
    })
    p.beginTick()
    const inst = p.getSystemInstrument()!
    inst.beforeSystem('a')
    inst.afterSystem('a')
    inst.beforeSystem('b')
    inst.afterSystem('b')
    const sample = p.endTick({ tickIndex: 1, simDtSec: 1 / 60 })

    expect(sample).toBeDefined()
    expect(sample!.tickIndex).toBe(1)
    expect(sample!.simDtSec).toBe(1 / 60)
    expect(sample!.wallClockStartMs).toBe(100)
    expect(sample!.wallClockEndMs).toBe(112)
    expect(sample!.totalDurationMs).toBe(12)
    expect(sample!.systems).toEqual([
      { name: 'a', durationMs: 3 },
      { name: 'b', durationMs: 6 },
    ])
  })

  it('pushes samples into the rolling buffer', () => {
    // Two ticks. Each tick consumes 4 now() reads (begin, sysStart,
    // sysEnd, end), one system per tick for brevity.
    const p = new SimulationProfiler({
      nowMs: sequenceNow([
        0, 1, 2, 3,    // tick 1: tickStart=0, sys start=1, end=2, tickEnd=3
        10, 11, 12, 14, // tick 2
      ]),
    })

    for (const i of [1, 2]) {
      p.beginTick()
      const inst = p.getSystemInstrument()!
      inst.beforeSystem('only')
      inst.afterSystem('only')
      p.endTick({ tickIndex: i, simDtSec: 1 / 60 })
    }

    const snap = p.getSnapshot()
    expect(snap.historyMs).toEqual([3, 4])
    expect(snap.tick.sampleCount).toBe(2)
    expect(snap.perSystem.only.sampleCount).toBe(2)
  })

  it('setEnabled(false) skips sample collection and clears pending systems', () => {
    const p = new SimulationProfiler({ nowMs: sequenceNow([0, 1, 2, 3]) })
    p.beginTick()
    const inst = p.getSystemInstrument()!
    inst.beforeSystem('keep')
    inst.afterSystem('keep')
    p.setEnabled(false)
    const sample = p.endTick({ tickIndex: 1, simDtSec: 1 / 60 })
    expect(sample).toBeUndefined()
    expect(p.getSystemInstrument()).toBeUndefined()
    expect(p.getSnapshot().historyMs).toEqual([])
  })

  it('clear() wipes the rolling buffer', () => {
    const p = new SimulationProfiler({
      nowMs: sequenceNow([0, 1, 2, 3]),
    })
    p.beginTick()
    const inst = p.getSystemInstrument()!
    inst.beforeSystem('a')
    inst.afterSystem('a')
    p.endTick({ tickIndex: 1, simDtSec: 1 / 60 })
    expect(p.getSnapshot().historyMs.length).toBe(1)
    p.clear()
    expect(p.getSnapshot().historyMs).toEqual([])
  })

  it('respects an explicit history capacity', () => {
    const p = new SimulationProfiler({
      nowMs: () => 0,
      historyCapacity: 2,
    })
    // Six now() reads per tick * 3 ticks = 18 reads. Using constant
    // 0-returning clock keeps determinism without long fixture arrays.
    for (const i of [1, 2, 3]) {
      p.beginTick()
      const inst = p.getSystemInstrument()!
      inst.beforeSystem('a')
      inst.afterSystem('a')
      p.endTick({ tickIndex: i, simDtSec: 1 / 60 })
    }
    const snap = p.getSnapshot()
    expect(snap.capacity).toBe(2)
    expect(snap.historyMs.length).toBe(2)
    expect(snap.latest?.tickIndex).toBe(3)
  })
})
