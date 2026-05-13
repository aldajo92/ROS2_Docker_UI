/**
 * Mulberry32 — deterministic 32-bit PRNG (public domain).
 *
 * Produces uniform samples in [0, 1) given a fixed integer seed.
 * Identical algorithm to the one embedded in `GaussianPoseNoise2D`
 * but extracted here so `LidarNoiseModel` can inject it without
 * importing the pose-noise module.
 *
 * Usage:
 *   const rng = new SeededRandom(1234)
 *   const x = rng.next() // deterministic
 */
export class SeededRandom {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Box-Muller transform: returns one standard-normal sample using two
 * uniform draws from `rng`. Clamps u1 away from 0 to avoid `ln(0)`.
 */
export function gaussianSample(rng: SeededRandom): number {
  const u1 = Math.max(rng.next(), Number.EPSILON)
  const u2 = rng.next()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
