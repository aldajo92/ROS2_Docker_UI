/**
 * Simulated clock. Tracks elapsed sim time and the most recent dt.
 *
 * Decoupled from wall-clock time: the engine can step at any rate
 * (real-time, faster, slower, single-step) and replay deterministically.
 */
export class SimulationClock {
  private timeSec: number
  private lastDt: number

  constructor(initialTimeSec = 0) {
    this.timeSec = initialTimeSec
    this.lastDt = 0
  }

  tick(dt: number): void {
    if (!Number.isFinite(dt) || dt < 0) {
      throw new Error(`SimulationClock.tick: invalid dt=${dt}`)
    }
    this.lastDt = dt
    this.timeSec += dt
  }

  reset(initialTimeSec = 0): void {
    this.timeSec = initialTimeSec
    this.lastDt = 0
  }

  /** Current simulated time in seconds. */
  time(): number {
    return this.timeSec
  }

  /** Most recent delta time in seconds (0 before the first tick). */
  dt(): number {
    return this.lastDt
  }
}
