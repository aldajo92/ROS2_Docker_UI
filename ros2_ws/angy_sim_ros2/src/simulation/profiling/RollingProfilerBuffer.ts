import type {
  ProfilerAggregate,
  ProfilerSnapshot,
  TickTimingSample,
} from './ProfilerTypes'
import { DEFAULT_PROFILER_HISTORY_CAPACITY } from './ProfilerTypes'

const EMPTY_AGGREGATE: ProfilerAggregate = {
  sampleCount: 0,
  avgMs: 0,
  minMs: 0,
  maxMs: 0,
}

/**
 * Fixed-capacity ring buffer of {@link TickTimingSample}s. Pure data
 * structure: no DOM, no timers, no events. The buffer is bounded so
 * the profiler never grows unbounded memory even if the UI never
 * consumes samples.
 *
 * `setCapacity` truncates the oldest samples when the new capacity is
 * smaller than the current population. The buffer does NOT retain
 * samples beyond capacity (FIFO eviction).
 */
export class RollingProfilerBuffer {
  private samples: TickTimingSample[] = []
  private capacity: number

  constructor(capacity: number = DEFAULT_PROFILER_HISTORY_CAPACITY) {
    this.capacity = sanitizeCapacity(capacity)
  }

  getCapacity(): number {
    return this.capacity
  }

  setCapacity(capacity: number): void {
    const next = sanitizeCapacity(capacity)
    this.capacity = next
    if (this.samples.length > next) {
      this.samples.splice(0, this.samples.length - next)
    }
  }

  push(sample: TickTimingSample): void {
    this.samples.push(sample)
    if (this.samples.length > this.capacity) {
      this.samples.shift()
    }
  }

  clear(): void {
    this.samples.length = 0
  }

  size(): number {
    return this.samples.length
  }

  latest(): TickTimingSample | undefined {
    return this.samples.length === 0
      ? undefined
      : this.samples[this.samples.length - 1]
  }

  /**
   * Return a snapshot suitable for the UI: latest sample, per-tick
   * aggregate, per-system aggregate (keyed by system name), an
   * estimated ticks-per-second (from wall-clock inter-sample deltas),
   * and the total-tick-ms history series for the sparkline.
   */
  snapshot(): ProfilerSnapshot {
    const latest = this.latest()
    const historyMs = this.samples.map((s) => s.totalDurationMs)
    return {
      latest,
      tick: aggregateTick(this.samples),
      perSystem: aggregatePerSystem(this.samples),
      ticksPerSec: estimateTicksPerSec(this.samples),
      historyMs,
      capacity: this.capacity,
      enabled: true,
    }
  }

  /** Read-only view, only used by tests to avoid cloning costs. */
  toArray(): readonly TickTimingSample[] {
    return this.samples
  }
}

function sanitizeCapacity(capacity: number): number {
  if (!Number.isFinite(capacity) || capacity < 1) return 1
  return Math.floor(capacity)
}

function aggregateTick(
  samples: readonly TickTimingSample[],
): ProfilerAggregate {
  if (samples.length === 0) return EMPTY_AGGREGATE
  let sum = 0
  let min = Number.POSITIVE_INFINITY
  let max = 0
  for (const s of samples) {
    const v = s.totalDurationMs
    sum += v
    if (v < min) min = v
    if (v > max) max = v
  }
  return {
    sampleCount: samples.length,
    avgMs: sum / samples.length,
    minMs: min,
    maxMs: max,
  }
}

function aggregatePerSystem(
  samples: readonly TickTimingSample[],
): Readonly<Record<string, ProfilerAggregate>> {
  if (samples.length === 0) return {}
  const acc: Record<
    string,
    { sum: number; min: number; max: number; count: number }
  > = {}
  for (const sample of samples) {
    for (const sys of sample.systems) {
      let entry = acc[sys.name]
      if (!entry) {
        entry = { sum: 0, min: Number.POSITIVE_INFINITY, max: 0, count: 0 }
        acc[sys.name] = entry
      }
      entry.sum += sys.durationMs
      if (sys.durationMs < entry.min) entry.min = sys.durationMs
      if (sys.durationMs > entry.max) entry.max = sys.durationMs
      entry.count += 1
    }
  }
  const out: Record<string, ProfilerAggregate> = {}
  for (const [name, e] of Object.entries(acc)) {
    out[name] = {
      sampleCount: e.count,
      avgMs: e.sum / e.count,
      minMs: e.min,
      maxMs: e.max,
    }
  }
  return out
}

/**
 * Estimate ticks-per-second from wall-clock inter-sample deltas.
 * Uses at most the last `N` samples where N is bounded to 30 to keep
 * the estimator responsive to speed-factor changes. Returns 0 when
 * fewer than two samples exist (no deltas to average).
 */
function estimateTicksPerSec(
  samples: readonly TickTimingSample[],
): number {
  if (samples.length < 2) return 0
  const window = Math.min(30, samples.length)
  const start = samples.length - window
  const first = samples[start]
  const last = samples[samples.length - 1]
  const deltaMs = last.wallClockStartMs - first.wallClockStartMs
  if (deltaMs <= 0) return 0
  const intervals = window - 1
  return (1000 * intervals) / deltaMs
}
