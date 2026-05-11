type StepCallback = (dt: number) => void | Promise<void>

export interface SimulationLoopOptions {
  /** Fixed simulation step in seconds (default 1/60 ≈ 16.67 ms). */
  fixedDtSec?: number
  /** Real-time multiplier; 2 = twice as fast, 0.5 = half speed. */
  speedFactor?: number
}

/**
 * Drives the engine at a fixed simulation step using `setInterval`.
 * Deliberately ignorant of rendering: the loop only invokes `step(dt)`.
 *
 * `setInterval` (over `requestAnimationFrame`) keeps the loop usable in
 * Node tests and in headless workers; if vsync-locked stepping is
 * needed the renderer can drive `stepOnce(dt)` from its frame loop.
 *
 * When the step callback returns a Promise (async runtime), the loop
 * skips the next interval fire until the current tick resolves —
 * preventing overlapping ticks under a slow remote backend.
 */
export class SimulationLoop {
  private fixedDtSec: number
  private speedFactor: number
  private callback: StepCallback | null = null
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private ticking = false

  constructor(options: SimulationLoopOptions = {}) {
    this.fixedDtSec = options.fixedDtSec ?? 1 / 60
    this.speedFactor = options.speedFactor ?? 1
  }

  setStepCallback(cb: StepCallback): void {
    this.callback = cb
  }

  setSpeedFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`SimulationLoop.setSpeedFactor: must be > 0, got ${factor}`)
    }
    const wasRunning = this.isRunning()
    this.speedFactor = factor
    if (wasRunning) {
      this.pause()
      this.start()
    }
  }

  getFixedDt(): number {
    return this.fixedDtSec
  }

  isRunning(): boolean {
    return this.intervalHandle !== null
  }

  start(): void {
    if (this.intervalHandle !== null) return
    const realIntervalMs = (this.fixedDtSec * 1000) / this.speedFactor
    this.intervalHandle = setInterval(() => this.fire(), realIntervalMs)
  }

  pause(): void {
    if (this.intervalHandle === null) return
    clearInterval(this.intervalHandle)
    this.intervalHandle = null
  }

  /** Manually step once; ignored if the timer-driven loop is running. */
  stepOnce(dt = this.fixedDtSec): void {
    if (this.intervalHandle !== null) return
    if (this.callback) this.callback(dt)
  }

  private fire(): void {
    if (this.ticking) return
    const result = this.callback?.(this.fixedDtSec)
    if (result instanceof Promise) {
      this.ticking = true
      result.finally(() => {
        this.ticking = false
      })
    }
  }
}
