import { describe, expect, it, vi } from 'vitest'
import { VehicleNoisyPosePublisherBridge } from './VehicleNoisyPosePublisherBridge'
import { GaussianPoseNoise2D } from '../../sensors/GaussianPoseNoise2D'
import type { SimPoseWithCovarianceMessage } from '../messages/SimPoseWithCovarianceMessage'

const ZERO_NOISE = new GaussianPoseNoise2D({ stdDevX: 0, stdDevY: 0, stdDevYaw: 0, seed: 0 })

function makeVehicle(x = 1, y = 2, yaw = 0.5) {
  return {
    id: 'ego',
    type: 'vehicle' as const,
    pose: { position: { x, y }, yaw },
    controls: {},
  }
}

function makeEngine(entity?: ReturnType<typeof makeVehicle>, timeSec = 10) {
  const entities = new Map<string, typeof entity>()
  if (entity) entities.set(entity.id, entity)
  return {
    state: {
      entities: entities as unknown as Map<string, { type: string }>,
      clock: { timeSec },
    },
  }
}

function makeBridge(opts: {
  vehicle?: ReturnType<typeof makeVehicle>
  timeSec?: number
  publishFn?: ReturnType<typeof vi.fn>
  fromInternalFn?: ReturnType<typeof vi.fn>
  frameId?: string
  childFrameId?: string
}) {
  const publishFn = opts.publishFn ?? vi.fn()
  const fromInternalFn = opts.fromInternalFn ?? vi.fn((m) => m)
  const transport = { publish: publishFn } as never
  const engine = makeEngine(opts.vehicle, opts.timeSec ?? 10) as never
  const adapter = { fromInternal: fromInternalFn, toInternal: vi.fn() } as never
  const bridge = new VehicleNoisyPosePublisherBridge(
    transport, 'ego', '/sim/ego/noisy_pose', engine, adapter, ZERO_NOISE,
    opts.frameId ?? 'map', opts.childFrameId ?? 'ego',
  )
  return { bridge, publishFn, fromInternalFn }
}

describe('VehicleNoisyPosePublisherBridge', () => {
  it('does not publish before start()', async () => {
    const { bridge, publishFn } = makeBridge({ vehicle: makeVehicle() })
    await bridge.publishOnce()
    expect(publishFn).not.toHaveBeenCalled()
  })

  it('does not publish after stop()', async () => {
    const { bridge, publishFn } = makeBridge({ vehicle: makeVehicle() })
    await bridge.start()
    await bridge.stop()
    await bridge.publishOnce()
    expect(publishFn).not.toHaveBeenCalled()
  })

  it('does not publish when vehicle is missing', async () => {
    const { bridge, publishFn } = makeBridge({})
    await bridge.start()
    await bridge.publishOnce()
    expect(publishFn).not.toHaveBeenCalled()
  })

  it('does not publish for a non-vehicle entity', async () => {
    const notVehicle = { id: 'ego', type: 'obstacle' } as never
    const engine = makeEngine(notVehicle) as never
    const publishFn = vi.fn()
    const transport = { publish: publishFn } as never
    const adapter = { fromInternal: vi.fn((m) => m), toInternal: vi.fn() } as never
    const bridge = new VehicleNoisyPosePublisherBridge(
      transport, 'ego', '/sim/ego/noisy_pose', engine, adapter, ZERO_NOISE,
    )
    await bridge.start()
    await bridge.publishOnce()
    expect(publishFn).not.toHaveBeenCalled()
  })

  it('publishes once for a valid vehicle', async () => {
    const { bridge, publishFn } = makeBridge({ vehicle: makeVehicle() })
    await bridge.start()
    await bridge.publishOnce()
    expect(publishFn).toHaveBeenCalledTimes(1)
    expect(publishFn).toHaveBeenCalledWith('/sim/ego/noisy_pose', expect.anything())
  })

  it('uses simulation time for the stamp', async () => {
    const { bridge, fromInternalFn } = makeBridge({ vehicle: makeVehicle(), timeSec: 42.5 })
    await bridge.start()
    await bridge.publishOnce()
    const msg = fromInternalFn.mock.calls[0][0] as SimPoseWithCovarianceMessage
    expect(msg.header.stampSec).toBe(42.5)
  })

  it('uses the configured frameId', async () => {
    const { bridge, fromInternalFn } = makeBridge({ vehicle: makeVehicle(), frameId: 'odom' })
    await bridge.start()
    await bridge.publishOnce()
    const msg = fromInternalFn.mock.calls[0][0] as SimPoseWithCovarianceMessage
    expect(msg.header.frameId).toBe('odom')
  })

  it('uses the configured childFrameId', async () => {
    const { bridge, fromInternalFn } = makeBridge({ vehicle: makeVehicle(), childFrameId: 'base_link' })
    await bridge.start()
    await bridge.publishOnce()
    const msg = fromInternalFn.mock.calls[0][0] as SimPoseWithCovarianceMessage
    expect(msg.childFrameId).toBe('base_link')
  })

  it('defaults childFrameId to vehicleId', async () => {
    const { fromInternalFn } = makeBridge({ vehicle: makeVehicle() })
    const publishFn = vi.fn()
    const transport = { publish: publishFn } as never
    const engine = makeEngine(makeVehicle()) as never
    const adapter = { fromInternal: fromInternalFn, toInternal: vi.fn() } as never
    const bridge = new VehicleNoisyPosePublisherBridge(
      transport, 'ego', '/sim/ego/noisy_pose', engine, adapter, ZERO_NOISE, 'map',
    )
    await bridge.start()
    await bridge.publishOnce()
    const msg = fromInternalFn.mock.calls[0][0] as SimPoseWithCovarianceMessage
    expect(msg.childFrameId).toBe('ego')
  })

  it('passes covariance from noise model', async () => {
    const { bridge, fromInternalFn } = makeBridge({ vehicle: makeVehicle() })
    await bridge.start()
    await bridge.publishOnce()
    const msg = fromInternalFn.mock.calls[0][0] as SimPoseWithCovarianceMessage
    expect(msg.covariance).toHaveLength(36)
    expect(msg.covariance.every((v) => v === 0)).toBe(true)
  })

  it('does not mutate vehicle pose', async () => {
    const vehicle = makeVehicle(5, 6, 1.2)
    const { bridge } = makeBridge({ vehicle })
    await bridge.start()
    await bridge.publishOnce()
    expect(vehicle.pose.position.x).toBe(5)
    expect(vehicle.pose.position.y).toBe(6)
    expect(vehicle.pose.yaw).toBe(1.2)
  })

  it('pose in message reflects ground truth when noise is zero', async () => {
    const vehicle = makeVehicle(3.3, -1.1, 0.9)
    const { bridge, fromInternalFn } = makeBridge({ vehicle })
    await bridge.start()
    await bridge.publishOnce()
    const msg = fromInternalFn.mock.calls[0][0] as SimPoseWithCovarianceMessage
    expect(msg.pose.x).toBeCloseTo(3.3)
    expect(msg.pose.y).toBeCloseTo(-1.1)
    expect(msg.pose.yaw).toBeCloseTo(0.9)
  })
})
