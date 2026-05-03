import {
  dwarn,
  getRenderDebugIntervalMs,
  isRenderDebugEnabled,
} from '../../debug/RenderDebug'
import type { SimulationState } from '../core/SimulationState'
import type { ExternalPathUpdateQueue } from '../paths/ExternalPathUpdateQueue'
import type { SimulationSystem } from './SimulationSystem'

/**
 * Drains the {@link ExternalPathUpdateQueue} into `state.paths` once
 * per tick. This is the *only* code path that writes externally-sourced
 * paths into `SimulationState`, which preserves the architectural rule
 * that external (rosbridge / WebSocket / DDS) callbacks must never
 * mutate simulation state directly.
 *
 * Tick order: register this system AFTER the systems that consume
 * `state.paths` for control / dynamics decisions but BEFORE the
 * recorder, so a path published mid-tick lands in the next recorded
 * frame rather than skipping it.
 *
 * The system is renderer-agnostic — Three.js and Phaser already pull
 * from `state.paths` via their respective `*PathRenderer`s, so adding
 * an external path here is enough to make it appear in both views.
 */
export class ExternalPathRenderSystem implements SimulationSystem {
  public readonly name = 'ExternalPathRenderSystem'
  private readonly queue: ExternalPathUpdateQueue

  // Diagnostic counters. None of these feed back into rendering
  // decisions — they exist purely so [Tick] logs can show whether
  // external path updates are being delivered, dropped, or stalled.
  private tickIndex = 0
  private upserts = 0
  private removes = 0
  private lastTickAtMs: number | null = null
  private windowMaxWallDtMs = 0
  private windowUpserts = 0
  private windowRemoves = 0
  private lastSummaryAtMs = 0

  constructor(queue: ExternalPathUpdateQueue) {
    this.queue = queue
  }

  update(dt: number, state: SimulationState): void {
    this.tickIndex += 1
    const now = nowMs()
    const wallDt = this.lastTickAtMs === null ? 0 : now - this.lastTickAtMs
    if (wallDt > this.windowMaxWallDtMs) this.windowMaxWallDtMs = wallDt
    this.lastTickAtMs = now

    // Heuristic: with a 60 Hz fixed dt we expect ~16.6 ms of
    // wall-clock between ticks. Anything beyond ~50 ms suggests the
    // host is being starved (long task, GC pause, blocking renderer)
    // and is worth surfacing immediately rather than waiting for the
    // throttled summary.
    if (wallDt > 50) {
      dwarn(
        'Tick',
        `tick=${this.tickIndex} simDt=${dt.toFixed(4)}s wallDt=${wallDt.toFixed(1)}ms (>50ms — likely starvation)`,
      )
    }

    let upsertsThisTick = 0
    let removesThisTick = 0
    if (this.queue.hasPending()) {
      const updates = this.queue.drain()
      for (const update of updates) {
        if (update.kind === 'upsert') {
          // PathRegistry.add is upsert (Map.set), so re-publishing the
          // same id with a new point list overwrites cleanly.
          state.paths.add(update.path)
          upsertsThisTick += 1
        } else {
          state.paths.remove(update.id)
          removesThisTick += 1
        }
      }
      this.upserts += upsertsThisTick
      this.removes += removesThisTick
      this.windowUpserts += upsertsThisTick
      this.windowRemoves += removesThisTick
    }

    // Throttled summary: emit one line per `getRenderDebugIntervalMs()`
    // window. Tracks per-window aggregates (max wall dt, upsert/remove
    // counts) so the line shows what happened *during* the window
    // rather than just the last tick.
    if (isRenderDebugEnabled()) {
      const interval = getRenderDebugIntervalMs()
      if (now - this.lastSummaryAtMs >= interval) {
        this.lastSummaryAtMs = now
        console.log(
          '[Tick]',
          `tick=${this.tickIndex}`,
          `simTime=${state.clock.time().toFixed(3)}s`,
          `simDt=${dt.toFixed(4)}s`,
          `wallDtMaxMs=${this.windowMaxWallDtMs.toFixed(1)}`,
          `upsertsInWindow=${this.windowUpserts}`,
          `removesInWindow=${this.windowRemoves}`,
          `upsertsTotal=${this.upserts}`,
          `removesTotal=${this.removes}`,
          `pendingAfterDrain=${this.queue.hasPending() ? 'yes' : 'no'}`,
          `paths=${state.paths.toArray().length}`,
        )
        this.windowMaxWallDtMs = 0
        this.windowUpserts = 0
        this.windowRemoves = 0
      }
    }
  }

  /** Drop any pending updates so `engine.reset()` starts clean. */
  reset(): void {
    this.queue.clear()
    this.tickIndex = 0
    this.upserts = 0
    this.removes = 0
    this.lastTickAtMs = null
    this.windowMaxWallDtMs = 0
    this.windowUpserts = 0
    this.windowRemoves = 0
    this.lastSummaryAtMs = 0
  }
}

function nowMs(): number {
  const perf = (
    globalThis as unknown as { performance?: { now?: () => number } }
  ).performance
  return perf?.now?.() ?? Date.now()
}
