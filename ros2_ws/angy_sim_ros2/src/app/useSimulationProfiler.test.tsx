// @vitest-environment happy-dom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SimulationEngine } from '../simulation/core/SimulationEngine'
import type { SimulationSystem } from '../simulation/systems/SimulationSystem'
import type { SimulationState } from '../simulation/core/SimulationState'
import { SimulationContext } from './SimulationContext'
import { SimulationController } from '../simulation/core/SimulationController'
import { VehicleCommandQueue } from '../simulation/commands/VehicleCommandQueue'
import { useSimulationProfiler } from './useSimulationProfiler'
import type { ProfilerSnapshot } from '../simulation/profiling/ProfilerTypes'

/**
 * Inert toy system — timing is supplied by the deterministic
 * `nowMs` sequence, so `update` just needs to exist.
 */
class NoopSystem implements SimulationSystem {
  readonly name: string
  constructor(name: string) {
    this.name = name
  }
  update(_dt: number, _state: SimulationState): void {
    // no-op
  }
}

interface Harness {
  container: HTMLDivElement
  root: Root
}

let nowSequence: number[]
let nowCursor: number

function nextNow(): number {
  if (nowCursor >= nowSequence.length) {
    throw new Error(
      `nextNow: ran past sequence end (cursor=${nowCursor})`,
    )
  }
  return nowSequence[nowCursor++]
}

/**
 * Build a context value around a SimulationEngine whose `nowMs` is
 * fed from `nowSequence`. Tests control exactly when the profiler
 * believes time has advanced.
 */
function buildContextValue() {
  const engine = new SimulationEngine({ nowMs: nextNow })
  engine.addSystem(new NoopSystem('only'))
  const controller = new SimulationController(engine)
  const commandQueue = new VehicleCommandQueue()
  return { engine, controller, commandQueue }
}

function mount(children: React.ReactNode): {
  harness: Harness
  ctx: ReturnType<typeof buildContextValue>
} {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const ctx = buildContextValue()
  act(() => {
    root.render(
      <SimulationContext.Provider value={ctx}>
        {children}
      </SimulationContext.Provider>,
    )
  })
  return { harness: { container, root }, ctx }
}

function unmount(harness: Harness | null) {
  if (!harness) return
  act(() => harness.root.unmount())
  harness.container.remove()
}

describe('useSimulationProfiler — UI throttling', () => {
  let harness: Harness | null = null
  let renderSpy: Mock<() => void>
  let capturedSnapshot: ProfilerSnapshot | null = null

  function Probe({
    updateIntervalMs,
  }: {
    updateIntervalMs?: number
  }) {
    const snap = useSimulationProfiler({ updateIntervalMs })
    capturedSnapshot = snap
    renderSpy()
    return <div data-testid="render-count">{renderSpy.mock.calls.length}</div>
  }

  beforeEach(() => {
    renderSpy = vi.fn(() => undefined)
    capturedSnapshot = null
    nowSequence = []
    nowCursor = 0
    vi.useFakeTimers()
  })

  afterEach(() => {
    unmount(harness)
    harness = null
    vi.useRealTimers()
  })

  it('updateIntervalMs=0 re-renders on every tick', () => {
    // 4 nowMs reads per tick (begin, sysBefore, sysAfter, end) × 3 ticks
    nowSequence = [
      0, 1, 2, 3,
      10, 11, 12, 13,
      20, 21, 22, 23,
    ]
    const mounted = mount(<Probe updateIntervalMs={0} />)
    harness = mounted.harness
    const baseline = renderSpy.mock.calls.length

    // One tick per `act()` so React commits separately for each. If
    // all three steps ran inside a single `act`, React would coalesce
    // the notifications into one commit and the assertion would
    // silently accept throttling we did not intend.
    for (let i = 0; i < 3; i++) {
      act(() => mounted.ctx.engine.step(1 / 60))
    }

    expect(renderSpy.mock.calls.length - baseline).toBe(3)
    expect(capturedSnapshot?.historyMs.length).toBe(3)
  })

  it('coalesces a burst of ticks within the interval into a single render', () => {
    // Six ticks within 50 ms (well under 250 ms window) should trigger
    // exactly one leading-edge render. The trailing-edge timer fires
    // later — verified in the next test.
    nowSequence = []
    for (let i = 0; i < 6; i++) {
      const base = i * 10 // ticks at 0, 10, 20, ... ms
      nowSequence.push(base, base + 1, base + 2, base + 3)
    }
    const mounted = mount(<Probe updateIntervalMs={250} />)
    harness = mounted.harness
    const baseline = renderSpy.mock.calls.length

    act(() => {
      for (let i = 0; i < 6; i++) mounted.ctx.engine.step(1 / 60)
    })

    // Leading-edge flush = exactly one render above the baseline.
    expect(renderSpy.mock.calls.length - baseline).toBe(1)
  })

  it('trailing-edge timer fires after the interval with no extra ticks', () => {
    nowSequence = []
    for (let i = 0; i < 6; i++) {
      const base = i * 10
      nowSequence.push(base, base + 1, base + 2, base + 3)
    }
    const mounted = mount(<Probe updateIntervalMs={250} />)
    harness = mounted.harness
    const baseline = renderSpy.mock.calls.length

    act(() => {
      for (let i = 0; i < 6; i++) mounted.ctx.engine.step(1 / 60)
    })
    expect(renderSpy.mock.calls.length - baseline).toBe(1)

    // Advance fake timers past the interval window; the pending
    // trailing flush should fire once (total = 2 additional renders).
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(renderSpy.mock.calls.length - baseline).toBe(2)
  })

  it('snapshot always reflects the latest ring buffer when it flushes', () => {
    nowSequence = []
    for (let i = 0; i < 3; i++) {
      const base = i * 1000 // well-separated ticks so each flushes
      nowSequence.push(base, base + 1, base + 2, base + 3)
    }
    const mounted = mount(<Probe updateIntervalMs={0} />)
    harness = mounted.harness

    act(() => {
      mounted.ctx.engine.step(1 / 60)
      mounted.ctx.engine.step(1 / 60)
      mounted.ctx.engine.step(1 / 60)
    })

    expect(capturedSnapshot).not.toBeNull()
    expect(capturedSnapshot!.historyMs.length).toBe(3)
    expect(capturedSnapshot!.latest?.tickIndex).toBe(3)
  })
})
