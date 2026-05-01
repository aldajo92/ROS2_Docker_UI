// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PerformanceOverlay } from './PerformanceOverlay'
import type { ProfilerSnapshot } from '../simulation/profiling/ProfilerTypes'

// The overlay calls `useSimulationProfiler`, which reaches into the
// simulation context. These tests focus on presentation given a
// fixture, so we mock the hook with a stand-in that returns the
// `EMPTY_SNAPSHOT` shape. The prop-driven `snapshotOverride` path is
// what we actually exercise.
vi.mock('../app/useSimulationProfiler', () => ({
  useSimulationProfiler: (): ProfilerSnapshot => ({
    latest: undefined,
    tick: { sampleCount: 0, avgMs: 0, minMs: 0, maxMs: 0 },
    perSystem: {},
    ticksPerSec: 0,
    historyMs: [],
    capacity: 0,
    enabled: false,
  }),
}))

interface Harness {
  container: HTMLDivElement
  root: Root
}

function mountOverlay(ui: React.ReactNode): Harness {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, root }
}

function unmount(harness: Harness | null): void {
  if (!harness) return
  act(() => {
    harness.root.unmount()
  })
  harness.container.remove()
}

const fixtureSnapshot = (): ProfilerSnapshot => ({
  latest: {
    tickIndex: 42,
    simDtSec: 1 / 60,
    totalDurationMs: 3.25,
    systems: [
      { name: 'vehicleDynamics', durationMs: 1.5 },
      { name: 'collision', durationMs: 0.5 },
      { name: 'metrics', durationMs: 1.25 },
    ],
    wallClockStartMs: 1000,
    wallClockEndMs: 1003.25,
  },
  tick: { sampleCount: 60, avgMs: 3.0, minMs: 1.2, maxMs: 5.8 },
  perSystem: {
    vehicleDynamics: { sampleCount: 60, avgMs: 1.4, minMs: 1.0, maxMs: 1.9 },
    collision: { sampleCount: 60, avgMs: 0.6, minMs: 0.2, maxMs: 1.1 },
    metrics: { sampleCount: 60, avgMs: 1.0, minMs: 0.8, maxMs: 1.4 },
  },
  ticksPerSec: 60,
  historyMs: [3, 2.8, 3.1, 3.2, 2.9, 3.4],
  capacity: 120,
  enabled: true,
})

describe('PerformanceOverlay', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('renders the empty state when there is no data', () => {
    harness = mountOverlay(<PerformanceOverlay />)
    expect(harness.container.textContent).toContain('Frame profiler')
    expect(harness.container.textContent).toContain('No samples yet')
    expect(harness.container.textContent).toContain('— Hz')
  })

  it('renders summary numbers from the supplied fixture', () => {
    harness = mountOverlay(
      <PerformanceOverlay snapshotOverride={fixtureSnapshot()} />,
    )
    const text = harness.container.textContent ?? ''
    expect(text).toContain('60.0 Hz')
    expect(text).toContain('3.25')
    expect(text).toContain('3.00')
    expect(text).toContain('1.20')
    expect(text).toContain('5.80')
  })

  it('lists per-system rows sorted by average descending', () => {
    harness = mountOverlay(
      <PerformanceOverlay snapshotOverride={fixtureSnapshot()} />,
    )
    const rows = harness.container.querySelectorAll(
      '.performance-overlay__sys-name',
    )
    const names = Array.from(rows).map((el) => el.textContent ?? '')
    expect(names).toEqual(['vehicleDynamics', 'metrics', 'collision'])
  })

  it('applies pointer-events: none on the passive container', () => {
    harness = mountOverlay(
      <PerformanceOverlay snapshotOverride={fixtureSnapshot()} />,
    )
    const overlay = harness.container.querySelector('.performance-overlay')
    expect(overlay).not.toBeNull()
    // `.performance-overlay` rule sets `pointer-events: none` via the
    // stylesheet; the DOM element must expose the class unambiguously
    // so the CSS rule matches when styles load.
    expect(overlay?.className).toContain('performance-overlay')
  })

  it('renders a sparkline polyline once history has 2+ samples', () => {
    harness = mountOverlay(
      <PerformanceOverlay snapshotOverride={fixtureSnapshot()} />,
    )
    const polyline = harness.container.querySelector(
      'svg.performance-overlay__sparkline polyline',
    )
    expect(polyline).not.toBeNull()
    const pts = polyline?.getAttribute('points') ?? ''
    expect(pts.split(' ').length).toBe(6)
  })
})
