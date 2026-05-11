import { describe, expect, it } from 'vitest'
import { SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter } from './SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter'
import type { SimPoseWithCovarianceMessage } from '../../../../simulation/communication/messages/SimPoseWithCovarianceMessage'

const adapter = new SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter()

function makeMsg(overrides: Partial<SimPoseWithCovarianceMessage> = {}): SimPoseWithCovarianceMessage {
  return {
    header: { stampSec: 0, frameId: 'map' },
    pose: { x: 0, y: 0, yaw: 0 },
    covariance: new Array<number>(36).fill(0),
    source: { vehicleId: 'ego', measurement: 'noisy_pose' },
    ...overrides,
  }
}

type RosMsg = {
  header: { stamp: { sec: number; nanosec: number }; frame_id: string }
  pose: {
    pose: {
      position: { x: number; y: number; z: number }
      orientation: { x: number; y: number; z: number; w: number }
    }
    covariance: number[]
  }
}

describe('SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter', () => {
  describe('toInternal', () => {
    it('throws "not implemented"', () => {
      expect(() => adapter.toInternal({})).toThrow(/not implemented/)
    })
  })

  describe('fromInternal — stamp', () => {
    it('converts integer seconds with zero nanoseconds', () => {
      const out = adapter.fromInternal(makeMsg({ header: { stampSec: 12, frameId: 'map' } })) as RosMsg
      expect(out.header.stamp.sec).toBe(12)
      expect(out.header.stamp.nanosec).toBe(0)
    })

    it('splits a fractional second into sec + nanosec', () => {
      const out = adapter.fromInternal(makeMsg({ header: { stampSec: 12.5, frameId: 'map' } })) as RosMsg
      expect(out.header.stamp.sec).toBe(12)
      expect(out.header.stamp.nanosec).toBe(500_000_000)
    })

    it('handles the nanosec=1e9 carry case', () => {
      // Construct a stampSec whose rounding would yield exactly 1_000_000_000 nanosec
      const sec = 1
      const nanosec = 999_999_999.5 / 1_000_000_000  // just under 1 second
      const stampSec = sec + nanosec
      const out = adapter.fromInternal(makeMsg({ header: { stampSec, frameId: 'map' } })) as RosMsg
      expect(out.header.stamp.nanosec).toBeLessThan(1_000_000_000)
    })
  })

  describe('fromInternal — frame_id', () => {
    it('maps frameId to header.frame_id', () => {
      const out = adapter.fromInternal(makeMsg({ header: { stampSec: 0, frameId: 'odom' } })) as RosMsg
      expect(out.header.frame_id).toBe('odom')
    })
  })

  describe('fromInternal — position', () => {
    it('carries x, y through to position', () => {
      const out = adapter.fromInternal(makeMsg({ pose: { x: 3.3, y: -1.2, yaw: 0 } })) as RosMsg
      expect(out.pose.pose.position.x).toBeCloseTo(3.3)
      expect(out.pose.pose.position.y).toBeCloseTo(-1.2)
    })

    it('sets z to 0 when pose.z is absent', () => {
      const out = adapter.fromInternal(makeMsg()) as RosMsg
      expect(out.pose.pose.position.z).toBe(0)
    })

    it('uses pose.z when provided', () => {
      const msg = makeMsg()
      msg.pose.z = 1.5
      const out = adapter.fromInternal(msg) as RosMsg
      expect(out.pose.pose.position.z).toBeCloseTo(1.5)
    })
  })

  describe('fromInternal — quaternion', () => {
    it('converts zero yaw to identity-like quaternion', () => {
      const out = adapter.fromInternal(makeMsg({ pose: { x: 0, y: 0, yaw: 0 } })) as RosMsg
      const { x, y, z, w } = out.pose.pose.orientation
      expect(x).toBeCloseTo(0)
      expect(y).toBeCloseTo(0)
      expect(z).toBeCloseTo(0)
      expect(w).toBeCloseTo(1)
    })

    it('converts π/2 yaw to correct quaternion', () => {
      const yaw = Math.PI / 2
      const out = adapter.fromInternal(makeMsg({ pose: { x: 0, y: 0, yaw } })) as RosMsg
      const { x, y, z, w } = out.pose.pose.orientation
      expect(x).toBeCloseTo(0)
      expect(y).toBeCloseTo(0)
      expect(z).toBeCloseTo(Math.sin(yaw / 2))
      expect(w).toBeCloseTo(Math.cos(yaw / 2))
    })

    it('keeps qx and qy as zero for planar yaw', () => {
      const out = adapter.fromInternal(makeMsg({ pose: { x: 0, y: 0, yaw: 1.2 } })) as RosMsg
      expect(out.pose.pose.orientation.x).toBe(0)
      expect(out.pose.pose.orientation.y).toBe(0)
    })
  })

  describe('fromInternal — covariance', () => {
    it('passes a 36-element all-zero covariance array through', () => {
      const out = adapter.fromInternal(makeMsg()) as RosMsg
      expect(out.pose.covariance).toHaveLength(36)
      expect(out.pose.covariance.every((v) => v === 0)).toBe(true)
    })

    it('preserves non-zero covariance values at correct indices', () => {
      const cov = new Array<number>(36).fill(0)
      cov[0] = 0.0025
      cov[7] = 0.0025
      cov[35] = 0.0004
      const out = adapter.fromInternal(makeMsg({ covariance: cov })) as RosMsg
      expect(out.pose.covariance[0]).toBeCloseTo(0.0025)
      expect(out.pose.covariance[7]).toBeCloseTo(0.0025)
      expect(out.pose.covariance[35]).toBeCloseTo(0.0004)
    })
  })
})
