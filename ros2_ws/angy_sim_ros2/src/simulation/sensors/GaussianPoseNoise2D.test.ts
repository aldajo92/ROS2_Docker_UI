import { describe, expect, it } from 'vitest'
import { GaussianPoseNoise2D } from './GaussianPoseNoise2D'

const ZERO_NOISE = { stdDevX: 0, stdDevY: 0, stdDevYaw: 0 }

describe('GaussianPoseNoise2D', () => {
  describe('constructor validation', () => {
    it('accepts zero standard deviations', () => {
      expect(() => new GaussianPoseNoise2D(ZERO_NOISE)).not.toThrow()
    })

    it('throws for negative stdDevX', () => {
      expect(() => new GaussianPoseNoise2D({ stdDevX: -0.1, stdDevY: 0, stdDevYaw: 0 })).toThrow(/stdDevX/)
    })

    it('throws for negative stdDevY', () => {
      expect(() => new GaussianPoseNoise2D({ stdDevX: 0, stdDevY: -1, stdDevYaw: 0 })).toThrow(/stdDevY/)
    })

    it('throws for negative stdDevYaw', () => {
      expect(() => new GaussianPoseNoise2D({ stdDevX: 0, stdDevY: 0, stdDevYaw: -0.01 })).toThrow(/stdDevYaw/)
    })

    it('throws for NaN stdDevX', () => {
      expect(() => new GaussianPoseNoise2D({ stdDevX: NaN, stdDevY: 0, stdDevYaw: 0 })).toThrow(/stdDevX/)
    })

    it('throws for Infinity stdDevY', () => {
      expect(() => new GaussianPoseNoise2D({ stdDevX: 0, stdDevY: Infinity, stdDevYaw: 0 })).toThrow(/stdDevY/)
    })
  })

  describe('zero noise', () => {
    it('returns exact ground-truth pose when all stdDevs are zero', () => {
      const model = new GaussianPoseNoise2D(ZERO_NOISE)
      const pose = { x: 1.5, y: -2.3, yaw: 0.7 }
      const result = model.sample(pose)
      expect(result.x).toBe(pose.x)
      expect(result.y).toBe(pose.y)
      expect(result.yaw).toBeCloseTo(pose.yaw, 10)
    })
  })

  describe('determinism with seed', () => {
    it('produces the same samples for the same seed', () => {
      const config = { stdDevX: 0.1, stdDevY: 0.1, stdDevYaw: 0.05, seed: 42 }
      const m1 = new GaussianPoseNoise2D(config)
      const m2 = new GaussianPoseNoise2D(config)
      const pose = { x: 0, y: 0, yaw: 0 }
      expect(m1.sample(pose)).toEqual(m2.sample(pose))
      expect(m1.sample(pose)).toEqual(m2.sample(pose))
    })

    it('produces different samples for different seeds', () => {
      const pose = { x: 0, y: 0, yaw: 0 }
      const r1 = new GaussianPoseNoise2D({ stdDevX: 1, stdDevY: 1, stdDevYaw: 1, seed: 1 }).sample(pose)
      const r2 = new GaussianPoseNoise2D({ stdDevX: 1, stdDevY: 1, stdDevYaw: 1, seed: 2 }).sample(pose)
      expect(r1).not.toEqual(r2)
    })
  })

  describe('yaw wrapping', () => {
    it('wraps noisy yaw into [-π, π]', () => {
      // Use large yaw noise to ensure wrapping is exercised
      const model = new GaussianPoseNoise2D({ stdDevX: 0, stdDevY: 0, stdDevYaw: 5, seed: 99 })
      const pose = { x: 0, y: 0, yaw: Math.PI - 0.01 }
      for (let i = 0; i < 20; i++) {
        const { yaw } = model.sample(pose)
        expect(yaw).toBeGreaterThanOrEqual(-Math.PI - 1e-9)
        expect(yaw).toBeLessThanOrEqual(Math.PI + 1e-9)
      }
    })
  })

  describe('input immutability', () => {
    it('does not mutate the input pose', () => {
      const model = new GaussianPoseNoise2D({ stdDevX: 1, stdDevY: 1, stdDevYaw: 1, seed: 7 })
      const pose = { x: 3, y: 4, yaw: 1.0 }
      model.sample(pose)
      expect(pose.x).toBe(3)
      expect(pose.y).toBe(4)
      expect(pose.yaw).toBe(1.0)
    })
  })

  describe('buildCovariance', () => {
    it('places variances at indices [0], [7], [35]', () => {
      const model = new GaussianPoseNoise2D({ stdDevX: 2, stdDevY: 3, stdDevYaw: 4 })
      const cov = model.buildCovariance()
      expect(cov).toHaveLength(36)
      expect(cov[0]).toBeCloseTo(4)   // 2²
      expect(cov[7]).toBeCloseTo(9)   // 3²
      expect(cov[35]).toBeCloseTo(16) // 4²
    })

    it('fills all other indices with zero', () => {
      const model = new GaussianPoseNoise2D({ stdDevX: 1, stdDevY: 1, stdDevYaw: 1 })
      const cov = model.buildCovariance()
      const nonDiag = cov.filter((_, i) => i !== 0 && i !== 7 && i !== 35)
      expect(nonDiag.every((v) => v === 0)).toBe(true)
    })

    it('returns all zeros when all stdDevs are zero', () => {
      const model = new GaussianPoseNoise2D(ZERO_NOISE)
      expect(model.buildCovariance().every((v) => v === 0)).toBe(true)
    })
  })
})
