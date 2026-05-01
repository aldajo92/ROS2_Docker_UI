import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulationEngine } from './SimulationEngine'
import type { SimulationSystem } from '../systems/SimulationSystem'
import type { SimulationState } from './SimulationState'
import type { TickTimingSample } from '../profiling/ProfilerTypes'

/**
 * Toy system whose update does nothing. The profiler only measures
 * wall-clock durations, not simulation state; keeping systems inert
 * here focuses the assertions on timing + event shape.
 */
class NamedSystem implements SimulationSystem {
  readonly name: string
  constructor(name: string) {
    this.name = name
  }
  update(_dt: number, _state: SimulationState): void {
    // Intentionally empty — wall-clock time is supplied by nowMs().
  }
}

describe('SimulationEngine — profiler integration', () => {
  let engine: SimulationEngine
  let nowValues: number[]
  let cursor: number

  beforeEach(() => {
    nowValues = []
    cursor = 0
    engine = new SimulationEngine({
      nowMs: () => {
        if (cursor >= nowValues.length) {
          throw new Error(
            `nowMs: ran past end of test sequence (cursor=${cursor})`,
          )
        }
        return nowValues[cursor++]
      },
    })
  })

  it('exposes a profiler enabled by default', () => {
    expect(engine.profiler).toBeDefined()
    expect(engine.profiler.isEnabled()).toBe(true)
    expect(engine.getProfilerSnapshot().historyMs).toEqual([])
  })

  it('emits one profileSample per tick with per-system durations', () => {
    engine.addSystem(new NamedSystem('a'))
    engine.addSystem(new NamedSystem('b'))

    // For each tick the profiler reads nowMs 2 + 2*systems = 6 times.
    // Tick 1: tickStart=0, a=[1..3], b=[3..8], tickEnd=10
    // Tick 2: tickStart=100, a=[101..102], b=[102..105], tickEnd=106
    nowValues = [0, 1, 3, 3, 8, 10, 100, 101, 102, 102, 105, 106]

    const samples: TickTimingSample[] = []
    engine.events.on('profileSample', (s) => samples.push(s))

    engine.step(1 / 60)
    engine.step(1 / 60)

    expect(samples).toHaveLength(2)
    expect(samples[0]).toMatchObject({
      tickIndex: 1,
      totalDurationMs: 10,
      wallClockStartMs: 0,
      wallClockEndMs: 10,
      systems: [
        { name: 'a', durationMs: 2 },
        { name: 'b', durationMs: 5 },
      ],
    })
    expect(samples[1]).toMatchObject({
      tickIndex: 2,
      totalDurationMs: 6,
      systems: [
        { name: 'a', durationMs: 1 },
        { name: 'b', durationMs: 3 },
      ],
    })
  })

  it('profiler snapshot reflects the rolling window', () => {
    engine.addSystem(new NamedSystem('only'))
    // 4 reads per tick * 3 ticks
    nowValues = [
      0, 1, 4, 5,      // tick1: total=5, only=3
      10, 12, 15, 20,  // tick2: total=10, only=3
      30, 31, 40, 42,  // tick3: total=12, only=9
    ]
    for (let i = 0; i < 3; i++) engine.step(1 / 60)

    const snap = engine.getProfilerSnapshot()
    expect(snap.historyMs).toEqual([5, 10, 12])
    expect(snap.tick.sampleCount).toBe(3)
    expect(snap.tick.avgMs).toBeCloseTo(9, 10)
    expect(snap.tick.minMs).toBe(5)
    expect(snap.tick.maxMs).toBe(12)
    expect(snap.perSystem.only.sampleCount).toBe(3)
    expect(snap.latest?.tickIndex).toBe(3)
  })

  it('does not mutate SimulationState metrics beyond the tick counter', () => {
    engine.addSystem(new NamedSystem('only'))
    nowValues = Array.from({ length: 4 }, (_, i) => i)
    engine.step(1 / 60)
    // ticks is incremented once per tick (pre-existing contract).
    expect(engine.state.metrics.ticks).toBe(1)
    // Profiler never touches other metrics.
    expect(engine.state.metrics.collisionCount).toBe(0)
    expect(engine.state.metrics.totalDistance).toBe(0)
    expect(engine.state.metrics.peakSpeed).toBe(0)
  })

  it('engine.reset() clears retained profiler samples', () => {
    engine.addSystem(new NamedSystem('only'))
    nowValues = [0, 1, 2, 3]
    engine.step(1 / 60)
    expect(engine.getProfilerSnapshot().historyMs.length).toBe(1)

    engine.reset()
    expect(engine.getProfilerSnapshot().historyMs).toEqual([])
  })

  it('disabled profiler emits no profileSample and never reads nowMs', () => {
    const spy = vi.fn(() => 0)
    const disabled = new SimulationEngine({
      nowMs: spy,
      profilerEnabled: false,
    })
    disabled.addSystem(new NamedSystem('a'))

    const samples: TickTimingSample[] = []
    disabled.events.on('profileSample', (s) => samples.push(s))

    disabled.step(1 / 60)
    disabled.step(1 / 60)

    expect(samples).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it('preserves system registration order when instrumented', () => {
    const updateOrder: string[] = []
    class Tracker implements SimulationSystem {
      readonly name: string
      constructor(name: string) {
        this.name = name
      }
      update(_dt: number, _state: SimulationState): void {
        updateOrder.push(this.name)
      }
    }
    engine.addSystem(new Tracker('first'))
    engine.addSystem(new Tracker('second'))
    engine.addSystem(new Tracker('third'))

    nowValues = Array.from({ length: 8 }, (_, i) => i)
    engine.step(1 / 60)

    expect(updateOrder).toEqual(['first', 'second', 'third'])
  })
})
