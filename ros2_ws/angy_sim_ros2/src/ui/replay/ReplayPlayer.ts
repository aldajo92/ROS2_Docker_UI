import type { ReplaySession } from '../../simulation/recording/ReplaySession'

/**
 * Schedule a single deferred callback. Returning a cancel function lets
 * the player tear down without leaking when paused mid-step. The
 * default {@link defaultScheduler} uses `requestAnimationFrame` /
 * `setTimeout` fallback, but tests inject a synchronous scheduler so
 * playback can be exercised tick-by-tick without a real DOM.
 */
export type ReplayPlayerScheduler = (cb: () => void) => () => void

export interface ReplayPlayerOptions {
  /** Multiplier on real time (1 = recorded speed). Clamped to >0. */
  speed?: number
  /** Custom scheduler — defaults to rAF/setTimeout. */
  scheduler?: ReplayPlayerScheduler
  /** Wall-clock provider for tests. Defaults to `Date.now`. */
  now?: () => number
}

const DEFAULT_SPEED = 1

/**
 * UI-side timer driver that walks a {@link ReplaySession} forward in
 * (multiples of) recorded time. Lives in `src/ui/replay/` because the
 * default scheduler reaches for `requestAnimationFrame`; the
 * simulation core stays renderer/DOM-free.
 *
 * Contract:
 * - `play()` schedules forward steps until paused, disposed, or the
 *   session reaches the last frame (auto-pauses).
 * - `pause()` cancels any pending step. Idempotent.
 * - `setSpeed(n)` changes the cadence proportionally on the next tick;
 *   negative values are clamped to a small positive minimum.
 * - `dispose()` cancels and detaches the listener; safe to call
 *   multiple times.
 */
export class ReplayPlayer {
  private readonly session: ReplaySession
  private readonly scheduler: ReplayPlayerScheduler
  private readonly now: () => number

  private speed: number
  private playing = false
  private cancel: (() => void) | undefined
  private lastTickAt = 0

  constructor(session: ReplaySession, options?: ReplayPlayerOptions) {
    this.session = session
    this.scheduler = options?.scheduler ?? defaultScheduler
    this.now = options?.now ?? defaultNow
    this.speed = sanitizeSpeed(options?.speed ?? DEFAULT_SPEED)
  }

  isPlaying(): boolean {
    return this.playing
  }

  play(): void {
    if (this.playing) return
    if (this.session.getCurrentIndex() >= this.session.getFrameCount() - 1) {
      // Already at the end — nothing to play. Treat as a no-op so the
      // UI doesn't have to special-case the "ended" state before
      // calling play.
      return
    }
    this.playing = true
    this.lastTickAt = this.now()
    this.scheduleNext()
  }

  pause(): void {
    if (!this.playing) {
      // Cancel any orphaned scheduled callback defensively.
      this.cancel?.()
      this.cancel = undefined
      return
    }
    this.playing = false
    this.cancel?.()
    this.cancel = undefined
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  setSpeed(speed: number): void {
    this.speed = sanitizeSpeed(speed)
  }

  getSpeed(): number {
    return this.speed
  }

  /**
   * Stops playback and releases the scheduled callback. Calling
   * methods after `dispose` is safe (no-op) so the parent component
   * can dispose unconditionally during cleanup without juggling refs.
   */
  dispose(): void {
    this.pause()
  }

  private scheduleNext(): void {
    if (!this.playing) return
    this.cancel = this.scheduler(() => this.tick())
  }

  private tick(): void {
    if (!this.playing) return
    const now = this.now()
    const elapsedSec = Math.max(0, (now - this.lastTickAt) / 1000)
    this.lastTickAt = now

    const dt = this.session.getFixedDtSec()
    const stepsRaw = dt > 0 ? (elapsedSec * this.speed) / dt : 1
    const steps = Math.max(1, Math.floor(stepsRaw))

    this.session.stepForward(steps)

    if (this.session.getCurrentIndex() >= this.session.getFrameCount() - 1) {
      this.playing = false
      this.cancel = undefined
      return
    }

    this.scheduleNext()
  }
}

function sanitizeSpeed(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0.0001
  return speed
}

function defaultNow(): number {
  return Date.now()
}

const defaultScheduler: ReplayPlayerScheduler =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as { requestAnimationFrame?: unknown })
    .requestAnimationFrame === 'function'
    ? (cb) => {
        const handle = (
          globalThis as {
            requestAnimationFrame: (cb: () => void) => number
          }
        ).requestAnimationFrame(cb)
        return () => {
          ;(
            globalThis as {
              cancelAnimationFrame?: (handle: number) => void
            }
          ).cancelAnimationFrame?.(handle)
        }
      }
    : (cb) => {
        const handle = setTimeout(cb, 16)
        return () => clearTimeout(handle)
      }
