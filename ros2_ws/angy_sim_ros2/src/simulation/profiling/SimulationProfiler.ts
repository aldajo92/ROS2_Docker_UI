import { RollingProfilerBuffer } from './RollingProfilerBuffer'
import type {
  ProfilerSnapshot,
  SystemTimingSample,
  TickTimingSample,
} from './ProfilerTypes'
import { DEFAULT_PROFILER_HISTORY_CAPACITY } from './ProfilerTypes'

/** Injectable wall-clock function. Must return milliseconds. */
export type NowMsFn = () => number

/**
 * Minimal hook contract consumed by `SystemManager.update`. Kept as a
 * separate interface so the `SystemManager` signature does NOT depend
 * on the profiler itself, only on this tiny pair of callbacks.
 */
export interface SystemTickInstrument {
  beforeSystem(name: string): void
  afterSystem(name: string): void
}

export interface SimulationProfilerOptions {
  nowMs?: NowMsFn
  historyCapacity?: number
  enabled?: boolean
}

/**
 * Diagnostic-only wall-clock profiler for the engine tick pipeline.
 *
 * Responsibilities:
 * - Measure wall-clock duration of each registered system's `update`.
 * - Measure wall-clock duration of the whole tick (systems aggregate).
 * - Retain a bounded rolling window of samples.
 * - Build a consumer-friendly {@link ProfilerSnapshot}.
 *
 * Non-responsibilities:
 * - Never mutates `SimulationState`, entities, paths, trajectories,
 *   replay data, or renderer state.
 * - Never changes the fixed-step `dt` or the simulation clock.
 * - No DOM / renderer / framework dependencies.
 *
 * The `nowMs` function is injectable so tests can feed deterministic
 * sequences and so non-browser hosts can provide their own clock.
 */
export class SimulationProfiler {
  private readonly nowMs: NowMsFn
  private readonly buffer: RollingProfilerBuffer
  private enabled: boolean
  private tickStartMs = 0
  private systemStartMs = 0
  private pendingSystems: SystemTimingSample[] = []
  private readonly instrument: SystemTickInstrument

  constructor(options: SimulationProfilerOptions = {}) {
    this.nowMs = options.nowMs ?? defaultNowMs
    this.buffer = new RollingProfilerBuffer(
      options.historyCapacity ?? DEFAULT_PROFILER_HISTORY_CAPACITY,
    )
    this.enabled = options.enabled ?? true
    this.instrument = {
      beforeSystem: (_name: string) => {
        this.systemStartMs = this.nowMs()
      },
      afterSystem: (name: string) => {
        const durationMs = this.nowMs() - this.systemStartMs
        this.pendingSystems.push({ name, durationMs })
      },
    }
  }

  isEnabled(): boolean {
    return this.enabled
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.pendingSystems = []
    }
  }

  getHistoryCapacity(): number {
    return this.buffer.getCapacity()
  }

  setHistoryCapacity(capacity: number): void {
    this.buffer.setCapacity(capacity)
  }

  /** Drop all retained samples. Called by `engine.reset()`. */
  clear(): void {
    this.buffer.clear()
    this.pendingSystems = []
  }

  /**
   * Return a snapshot. Cheap but allocates; call only when the UI
   * actually needs to render (e.g. once per tick from the React hook,
   * or on demand from the controller).
   */
  getSnapshot(): ProfilerSnapshot {
    const snap = this.buffer.snapshot()
    return { ...snap, enabled: this.enabled }
  }

  /** Start-of-tick hook. No-op when disabled. */
  beginTick(): void {
    if (!this.enabled) return
    this.pendingSystems = []
    this.tickStartMs = this.nowMs()
  }

  /**
   * Instrument passed to `SystemManager.update(...)` when the profiler
   * is active. The instrument captures per-system durations; the
   * manager itself does not know or care about the profiler type.
   */
  getSystemInstrument(): SystemTickInstrument | undefined {
    return this.enabled ? this.instrument : undefined
  }

  /**
   * End-of-tick hook. Builds a {@link TickTimingSample} from the
   * pending per-system timings and pushes it into the rolling buffer.
   * Returns the sample so the engine can broadcast it verbatim via
   * `profileSample`.
   */
  endTick(params: {
    tickIndex: number
    simDtSec: number
  }): TickTimingSample | undefined {
    if (!this.enabled) return undefined
    const wallClockEndMs = this.nowMs()
    const sample: TickTimingSample = {
      tickIndex: params.tickIndex,
      simDtSec: params.simDtSec,
      totalDurationMs: wallClockEndMs - this.tickStartMs,
      systems: this.pendingSystems,
      wallClockStartMs: this.tickStartMs,
      wallClockEndMs,
    }
    this.buffer.push(sample)
    this.pendingSystems = []
    return sample
  }
}

/**
 * Default wall-clock source. Prefers `performance.now()` when
 * available (monotonic, sub-ms precision) and falls back to
 * `Date.now()` in environments that lack `performance` (rare).
 *
 * Deliberately uses `globalThis` + a defensive typeof check so this
 * module stays safe to import from Node test runners with no DOM.
 */
const defaultNowMs: NowMsFn = () => {
  const g = globalThis as { performance?: { now(): number } }
  if (g.performance && typeof g.performance.now === 'function') {
    return g.performance.now()
  }
  return Date.now()
}
