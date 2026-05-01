/**
 * Framework-free data contracts for the engine tick profiler.
 *
 * These types describe **wall-clock diagnostics** captured around the
 * simulation tick pipeline. They do NOT represent simulation time and
 * must never participate in physics, determinism, or replay. The
 * profiler is a read-only observer layered on top of `SystemManager`.
 */

/** Duration of a single system's `update(dt, state)` call, in ms. */
export interface SystemTimingSample {
  readonly name: string
  readonly durationMs: number
}

/**
 * Timing breakdown for a single simulation tick. Emitted as the payload
 * of the `profileSample` event and retained in the rolling buffer.
 *
 * All `*Ms` values are wall-clock milliseconds, typically from
 * `performance.now()`. `simDtSec` is the simulation step and is
 * included purely as context for the UI — it does not drive timing.
 */
export interface TickTimingSample {
  readonly tickIndex: number
  readonly simDtSec: number
  readonly totalDurationMs: number
  readonly systems: readonly SystemTimingSample[]
  readonly wallClockStartMs: number
  readonly wallClockEndMs: number
}

/**
 * Aggregate over a rolling window. `sampleCount === 0` implies the
 * other fields are zero; consumers should treat them as "no data".
 */
export interface ProfilerAggregate {
  readonly sampleCount: number
  readonly avgMs: number
  readonly minMs: number
  readonly maxMs: number
}

/**
 * Snapshot returned by `SimulationProfiler.getSnapshot()`. Structural
 * (plain data); safe to compare by reference across ticks thanks to
 * the profiler's immutable-per-tick construction.
 */
export interface ProfilerSnapshot {
  readonly latest?: TickTimingSample
  readonly tick: ProfilerAggregate
  readonly perSystem: Readonly<Record<string, ProfilerAggregate>>
  readonly ticksPerSec: number
  readonly historyMs: readonly number[]
  readonly capacity: number
  readonly enabled: boolean
}

/** Default rolling-window size (samples). At 60 Hz ≈ 2 seconds. */
export const DEFAULT_PROFILER_HISTORY_CAPACITY = 120
