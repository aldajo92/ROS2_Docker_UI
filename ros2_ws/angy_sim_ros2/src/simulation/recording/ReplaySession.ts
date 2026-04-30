import type { ReplayFileFormat } from './ReplayFormat'
import type { SimulationFrameSnapshot } from './SimulationFrameSnapshot'

export type ReplaySessionListener = (currentIndex: number) => void

/**
 * Pure-logic, simulation-side controller for an in-memory replay.
 *
 * `ReplaySession` owns the loaded {@link ReplayFileFormat} and a
 * "current frame" cursor. It exposes seek/step primitives plus a
 * single observation surface (`onChange`) so a UI-side timer driver
 * (Phase 3 `ReplayPlayer`) can drive playback without coupling this
 * class to React, the DOM, or wall-clock time.
 *
 * Architecture rules (enforced by `architecture.replay-session.test.ts`):
 * - No React, DOM, Three.js, Phaser, timers, or `src/ui` imports.
 * - Any state mutation routes through `seekToFrame` / `seekToTime` /
 *   `stepForward` / `stepBackward` / `reset` so listeners always see
 *   a consistent index.
 * - `onChange` fires only when the cursor actually moves; clamped
 *   no-op operations stay silent.
 */
export class ReplaySession {
  private readonly replay: ReplayFileFormat
  private currentIndex: number
  private readonly listeners = new Set<ReplaySessionListener>()

  constructor(replay: ReplayFileFormat) {
    if (!replay || !Array.isArray(replay.frames)) {
      throw new Error('ReplaySession: replay.frames must be an array')
    }
    if (replay.frames.length === 0) {
      throw new Error('ReplaySession: replay contains no frames')
    }
    this.replay = replay
    this.currentIndex = 0
  }

  getReplay(): ReplayFileFormat {
    return this.replay
  }

  getFrameCount(): number {
    return this.replay.frames.length
  }

  getDurationSec(): number {
    const frames = this.replay.frames
    if (frames.length < 2) return 0
    const last = frames.at(-1)
    if (!last) return 0
    return last.timeSec - frames[0].timeSec
  }

  getFixedDtSec(): number {
    return this.replay.fixedDtSec
  }

  getCurrentIndex(): number {
    return this.currentIndex
  }

  getCurrentFrame(): SimulationFrameSnapshot {
    return this.replay.frames[this.currentIndex]
  }

  getFrame(index: number): SimulationFrameSnapshot {
    const clamped = this.clampIndex(index)
    return this.replay.frames[clamped]
  }

  seekToFrame(index: number): void {
    this.setIndex(this.clampIndex(index))
  }

  /**
   * Linear scan — fine for the typical few-thousand-frame recording.
   * If/when replays grow past ~100k frames a binary search can drop
   * in here; the public contract stays the same.
   *
   * Lookup policy: returns the index of the first frame whose
   * `timeSec >= t`, clamped to the last frame when `t` exceeds the
   * recording duration, and clamped to `0` when `t` is below the
   * first frame's time.
   */
  seekToTime(timeSec: number): void {
    if (!Number.isFinite(timeSec)) return
    const frames = this.replay.frames
    const firstTime = frames[0].timeSec
    if (timeSec <= firstTime) {
      this.setIndex(0)
      return
    }
    for (let i = 0; i < frames.length; i++) {
      if (frames[i].timeSec >= timeSec) {
        this.setIndex(i)
        return
      }
    }
    this.setIndex(frames.length - 1)
  }

  stepForward(count = 1): void {
    if (!Number.isFinite(count)) return
    const next = Math.floor(count)
    if (next === 0) return
    this.setIndex(this.clampIndex(this.currentIndex + next))
  }

  stepBackward(count = 1): void {
    if (!Number.isFinite(count)) return
    const next = Math.floor(count)
    if (next === 0) return
    this.setIndex(this.clampIndex(this.currentIndex - next))
  }

  /** Returns the cursor to the first frame; emits if it actually moved. */
  reset(): void {
    this.setIndex(0)
  }

  onChange(listener: ReplaySessionListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private setIndex(next: number): void {
    if (next === this.currentIndex) return
    this.currentIndex = next
    for (const l of this.listeners) l(next)
  }

  private clampIndex(index: number): number {
    if (!Number.isFinite(index)) return this.currentIndex
    const last = this.replay.frames.length - 1
    if (index < 0) return 0
    if (index > last) return last
    return Math.floor(index)
  }
}
