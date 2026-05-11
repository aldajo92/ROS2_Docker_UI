export interface GaussianPoseNoise2DConfig {
  stdDevX: number
  stdDevY: number
  stdDevYaw: number
  seed?: number
}

export interface NoisyPose2D {
  x: number
  y: number
  yaw: number
}

/**
 * Adds Gaussian noise to a 2D pose. When a `seed` is provided the RNG is
 * deterministic (mulberry32), making noise reproducible in tests and replay.
 * Without a seed, `Math.random()` is used.
 *
 * Covariance layout (36-element row-major [x, y, z, roll, pitch, yaw]):
 *   [0]  = stdDevX²   [7]  = stdDevY²   [35] = stdDevYaw²
 *   All other elements are 0 (unknown 2D dims treated as zero variance).
 */
export class GaussianPoseNoise2D {
  private readonly stdDevX: number
  private readonly stdDevY: number
  private readonly stdDevYaw: number
  private rng: () => number

  constructor(config: GaussianPoseNoise2DConfig) {
    const { stdDevX, stdDevY, stdDevYaw, seed } = config
    validateStdDev(stdDevX, 'stdDevX')
    validateStdDev(stdDevY, 'stdDevY')
    validateStdDev(stdDevYaw, 'stdDevYaw')

    this.stdDevX = stdDevX
    this.stdDevY = stdDevY
    this.stdDevYaw = stdDevYaw
    this.rng = seed !== undefined ? mulberry32(seed) : () => Math.random()
  }

  sample(truePose: { x: number; y: number; yaw: number }): NoisyPose2D {
    const x = truePose.x + gaussian(this.rng) * this.stdDevX
    const y = truePose.y + gaussian(this.rng) * this.stdDevY
    const rawYaw = truePose.yaw + gaussian(this.rng) * this.stdDevYaw
    const yaw = Math.atan2(Math.sin(rawYaw), Math.cos(rawYaw))
    return { x, y, yaw }
  }

  buildCovariance(): number[] {
    const cov = new Array<number>(36).fill(0)
    cov[0] = this.stdDevX * this.stdDevX
    cov[7] = this.stdDevY * this.stdDevY
    cov[35] = this.stdDevYaw * this.stdDevYaw
    return cov
  }
}

function validateStdDev(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`GaussianPoseNoise2D: ${name} must be a finite non-negative number, got ${value}`)
  }
}

// Box-Muller transform: produces a standard-normal sample using two uniform
// draws. Clamps u1 away from 0 to avoid ln(0).
function gaussian(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON)
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}

// Mulberry32 — fast 32-bit seeded PRNG (public domain).
function mulberry32(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) >>> 0
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
