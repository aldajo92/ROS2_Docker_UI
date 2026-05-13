import type { LidarNoiseConfig } from './LidarSensorSpec'
import { gaussianSample, type SeededRandom } from './SeededRandom'

/** All fields required so callers never silently skip a check. */
export type ResolvedNoiseConfig = Required<LidarNoiseConfig>

/** Returns a `ResolvedNoiseConfig` with every optional field filled in. */
export function resolveNoiseConfig(
  cfg: LidarNoiseConfig | undefined,
): ResolvedNoiseConfig {
  return {
    enabled: cfg?.enabled ?? false,
    rangeStdDev: cfg?.rangeStdDev ?? 0,
    rangeBias: cfg?.rangeBias ?? 0,
    angularStdDev: cfg?.angularStdDev ?? 0,
    dropoutProbability: cfg?.dropoutProbability ?? 0,
    outlierProbability: cfg?.outlierProbability ?? 0,
    outlierMinRange: cfg?.outlierMinRange ?? 0,
    outlierMaxRange: cfg?.outlierMaxRange ?? 0,
    quantizationStep: cfg?.quantizationStep ?? 0,
    seed: cfg?.seed ?? 0,
  }
}

/**
 * Apply the noise pipeline to a single ideal range reading.
 *
 * Pipeline order (matches the spec document):
 *   ideal → dropout → outlier → bias → gaussian → quantization → clamp
 *
 * Noise is deterministic when the caller supplies the same `SeededRandom`
 * instance in the same order across simulation runs.
 *
 * @param idealRange  Range from the noiseless raycast (metres).
 * @param cfg         Fully-resolved noise config.
 * @param rng         Caller-owned RNG (mutated by this call).
 * @param rangeMin    Sensor minimum range — values below this are masked.
 * @param rangeMax    Sensor maximum range — the returned "no hit" value.
 */
export function applyLidarRangeNoise(
  idealRange: number,
  cfg: ResolvedNoiseConfig,
  rng: SeededRandom,
  rangeMin: number,
  rangeMax: number,
): number {
  if (!cfg.enabled) return idealRange

  // Dropout — ray lost entirely; return max range.
  if (cfg.dropoutProbability > 0 && rng.next() < cfg.dropoutProbability) {
    return rangeMax
  }

  // Outlier — replace with a random reading in [outlierMinRange, outlierMaxRange].
  if (cfg.outlierProbability > 0 && rng.next() < cfg.outlierProbability) {
    const span = cfg.outlierMaxRange - cfg.outlierMinRange
    return cfg.outlierMinRange + rng.next() * Math.max(span, 0)
  }

  let r = idealRange

  // Constant bias.
  r += cfg.rangeBias

  // Gaussian range noise.
  if (cfg.rangeStdDev > 0) {
    r += gaussianSample(rng) * cfg.rangeStdDev
  }

  // Quantization.
  if (cfg.quantizationStep > 0) {
    r = Math.round(r / cfg.quantizationStep) * cfg.quantizationStep
  }

  // Clamp — mask below min, cap above max.
  if (r < rangeMin) return rangeMax
  if (r > rangeMax) return rangeMax
  return r
}
