import { describe, it, expect } from 'vitest'
import { applyLidarRangeNoise, resolveNoiseConfig } from './LidarNoiseModel'
import { SeededRandom } from './SeededRandom'

function rng(seed = 0): SeededRandom {
  return new SeededRandom(seed)
}

describe('applyLidarRangeNoise', () => {
  it('disabled noise returns ideal range unchanged', () => {
    const cfg = resolveNoiseConfig({ enabled: false })
    expect(applyLidarRangeNoise(3.5, cfg, rng(), 0, 8)).toBe(3.5)
  })

  it('bias shifts the range', () => {
    const cfg = resolveNoiseConfig({ enabled: true, rangeBias: 0.5 })
    const result = applyLidarRangeNoise(3.0, cfg, rng(), 0, 8)
    expect(result).toBeCloseTo(3.5, 5)
  })

  it('quantization snaps to nearest step', () => {
    const cfg = resolveNoiseConfig({ enabled: true, quantizationStep: 0.1 })
    const result = applyLidarRangeNoise(3.14, cfg, rng(), 0, 8)
    expect(result).toBeCloseTo(3.1, 5)
  })

  it('dropout probability 1 always returns rangeMax', () => {
    const cfg = resolveNoiseConfig({ enabled: true, dropoutProbability: 1 })
    const r = rng()
    expect(applyLidarRangeNoise(3.0, cfg, r, 0, 8)).toBe(8)
    expect(applyLidarRangeNoise(5.0, cfg, r, 0, 8)).toBe(8)
  })

  it('deterministic seed produces same output for same input sequence', () => {
    const cfg = resolveNoiseConfig({ enabled: true, rangeStdDev: 0.05, seed: 42 })
    const r1 = rng(42)
    const r2 = rng(42)
    const a = applyLidarRangeNoise(3.0, cfg, r1, 0, 8)
    const b = applyLidarRangeNoise(3.0, cfg, r2, 0, 8)
    expect(a).toBe(b)
  })

  it('range below rangeMin is masked to rangeMax', () => {
    const cfg = resolveNoiseConfig({ enabled: true, rangeBias: -10 })
    const result = applyLidarRangeNoise(3.0, cfg, rng(), 2, 8)
    // 3.0 - 10 = -7 which is < rangeMin=2 → returns 8
    expect(result).toBe(8)
  })

  it('range above rangeMax is capped to rangeMax', () => {
    const cfg = resolveNoiseConfig({ enabled: true, rangeBias: 100 })
    const result = applyLidarRangeNoise(3.0, cfg, rng(), 0, 8)
    expect(result).toBe(8)
  })
})
