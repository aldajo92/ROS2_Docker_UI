/**
 * Fires a `publish` callback on a fixed *simulation-time* period.
 *
 * The accumulator is fed by the engine's `dt` (the same `dt` consumed
 * by every system in the tick pipeline), so publishing rates scale
 * with simulated time, NOT wall-clock time. This means:
 *
 *   - When the simulation is paused, no publishes occur.
 *   - When the simulation is fast-forwarded, publishes scale with it.
 *   - The class deliberately avoids `setInterval` /
 *     `requestAnimationFrame` / `Date.now()` so it works identically
 *     in browsers, in Node tests, and under deterministic replay.
 *
 * The callback may return a Promise; its result is intentionally
 * detached (`void`) — transports are responsible for their own error
 * handling. If you need at-most-one-in-flight semantics, gate that in
 * the callback itself.
 */
export class PeriodicPublisher {
  private accumulator = 0
  private readonly periodSec: number
  private readonly publish: () => void | Promise<void>

  constructor(periodSec: number, publish: () => void | Promise<void>) {
    if (!Number.isFinite(periodSec) || periodSec <= 0) {
      throw new Error('periodSec must be a finite number greater than zero')
    }
    this.periodSec = periodSec
    this.publish = publish
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error(
        'dt must be a finite number greater than or equal to zero',
      )
    }

    this.accumulator += dt

    // Single fire per update keeps the publish rate monotone even when
    // an unusually large `dt` is fed in (e.g. a manual `step(0.5)`).
    // Any "missed" periods are absorbed silently — telemetry is a
    // sample, not a queue, so dropping is the right behavior.
    if (this.accumulator >= this.periodSec) {
      this.accumulator -= this.periodSec
      void this.publish()
    }
  }

  reset(): void {
    this.accumulator = 0
  }
}
