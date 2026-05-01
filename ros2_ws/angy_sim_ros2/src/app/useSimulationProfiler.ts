import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react'
import { useSimulation } from './useSimulation'
import type { ProfilerSnapshot } from '../simulation/profiling/ProfilerTypes'

/**
 * Default UI refresh cadence for the performance overlay. The
 * underlying profiler still samples every tick — this only controls
 * how often React is asked to re-render, so numbers don't flicker at
 * 60 Hz. 250 ms ≈ 4 Hz reads well without feeling laggy.
 */
export const DEFAULT_PROFILER_UPDATE_INTERVAL_MS = 250

export interface UseSimulationProfilerOptions {
  /**
   * Minimum interval between React re-renders, in milliseconds.
   * `0` means flush on every `profileSample` (full tick rate).
   * Defaults to {@link DEFAULT_PROFILER_UPDATE_INTERVAL_MS}.
   *
   * The hook uses a leading + trailing-edge strategy: the first sample
   * after an idle gap flushes immediately, subsequent samples are
   * coalesced until the window elapses, and a trailing timer
   * guarantees the last sample always lands in the UI.
   */
  updateIntervalMs?: number
}

/**
 * Subscribes to engine `profileSample` events and re-renders the
 * caller with a fresh {@link ProfilerSnapshot} at most once per
 * `updateIntervalMs`. The snapshot is always read from the live
 * profiler, so whenever the throttle fires the UI sees the full
 * rolling window (min/max/avg stay accurate even at slow refresh
 * rates).
 *
 * Implementation note: `useSyncExternalStore` requires `getSnapshot`
 * to return a stable reference between reads for the same logical
 * state. We tag each flush with a monotonically increasing version
 * number and cache the snapshot per version to satisfy that rule.
 *
 * The hook is UI-only. It never mutates `SimulationState` and never
 * calls the profiler setters.
 */
export function useSimulationProfiler(
  options: UseSimulationProfilerOptions = {},
): ProfilerSnapshot {
  const { engine } = useSimulation()
  const updateIntervalMs =
    options.updateIntervalMs ?? DEFAULT_PROFILER_UPDATE_INTERVAL_MS

  const versionRef = useRef(0)
  const snapshotRef = useRef<{
    version: number
    value: ProfilerSnapshot
  } | null>(null)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // NEGATIVE_INFINITY guarantees the first sample after (re)mount
      // always passes the leading-edge gate, regardless of how long
      // the component has been mounted or what the wall clock reads.
      let lastFlushMs = Number.NEGATIVE_INFINITY
      let pendingTimer: ReturnType<typeof setTimeout> | null = null

      const flush = () => {
        lastFlushMs = nowMs()
        pendingTimer = null
        versionRef.current += 1
        onStoreChange()
      }

      const off = engine.events.on('profileSample', () => {
        if (updateIntervalMs <= 0) {
          flush()
          return
        }
        const now = nowMs()
        const elapsed = now - lastFlushMs
        if (elapsed >= updateIntervalMs) {
          flush()
        } else if (pendingTimer === null) {
          // Schedule the trailing-edge flush so the final sample
          // after a burst always lands in the UI, even if no further
          // ticks fire (e.g. the engine is paused right after).
          pendingTimer = setTimeout(flush, updateIntervalMs - elapsed)
        }
      })

      return () => {
        off()
        if (pendingTimer !== null) {
          clearTimeout(pendingTimer)
          pendingTimer = null
        }
      }
    },
    [engine, updateIntervalMs],
  )

  const getSnapshot = useCallback((): ProfilerSnapshot => {
    const cached = snapshotRef.current
    if (cached && cached.version === versionRef.current) {
      return cached.value
    }
    const value = engine.getProfilerSnapshot()
    snapshotRef.current = { version: versionRef.current, value }
    return value
  }, [engine])

  // Server snapshot: profiling does not run on the server. Return a
  // stable empty snapshot so SSR never throws and hydration matches
  // the first client render (which will immediately update on tick).
  const getServerSnapshot = useCallback(
    (): ProfilerSnapshot => EMPTY_SNAPSHOT,
    [],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Helper for callers that prefer the controller facade. */
export function useSimulationProfilerEnabled(): {
  enabled: boolean
  setEnabled: (next: boolean) => void
} {
  const { controller } = useSimulation()
  return useMemo(
    () => ({
      get enabled() {
        return controller.isProfilerEnabled()
      },
      setEnabled: (next: boolean) => controller.setProfilerEnabled(next),
    }),
    [controller],
  )
}

/**
 * UI-side wall-clock reader. Unlike the engine profiler's `nowMs`,
 * this is intentionally browser-direct: the throttle lives in
 * `src/app/` where DOM / browser APIs are allowed.
 */
const nowMs = (): number => {
  const g = globalThis as { performance?: { now(): number } }
  if (g.performance && typeof g.performance.now === 'function') {
    return g.performance.now()
  }
  return Date.now()
}

const EMPTY_SNAPSHOT: ProfilerSnapshot = {
  latest: undefined,
  tick: { sampleCount: 0, avgMs: 0, minMs: 0, maxMs: 0 },
  perSystem: {},
  ticksPerSec: 0,
  historyMs: [],
  capacity: 0,
  enabled: false,
}
