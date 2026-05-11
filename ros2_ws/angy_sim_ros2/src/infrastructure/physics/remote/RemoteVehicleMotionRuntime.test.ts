import { describe, expect, it, vi, beforeEach } from 'vitest'
import { RemoteVehicleMotionRuntime } from './RemoteVehicleMotionRuntime'
import { InMemoryRemoteVehicleMotionClient } from './InMemoryRemoteVehicleMotionClient'
import type { RemoteVehicleMotionClient } from './RemoteVehicleMotionClient'
import { VehicleEntity } from '../../../simulation/entities/VehicleEntity'
import { Pose2D } from '../../../math/geometry/Pose2D'
import { Point2D } from '../../../math/geometry/Point2D'

function makeVehicle(id: string, v = 0, w = 0, x = 0, y = 0, yaw = 0): VehicleEntity {
  return new VehicleEntity({ id, pose: Pose2D.of(x, y, yaw), controls: { v, w } })
}

async function makeRuntime(
  client: RemoteVehicleMotionClient = new InMemoryRemoteVehicleMotionClient(),
): Promise<RemoteVehicleMotionRuntime> {
  return RemoteVehicleMotionRuntime.create(client)
}

describe('RemoteVehicleMotionRuntime', () => {
  it('name is "remote"', async () => {
    const rt = await makeRuntime()
    expect(rt.name).toBe('remote')
  })

  it('step() returns a Promise', async () => {
    const rt = await makeRuntime()
    rt.syncVehicles([makeVehicle('ego')])
    const result = rt.step(1.0)
    expect(result).toBeInstanceOf(Promise)
    await result
  })

  it('readVehicleState returns undefined before first step', async () => {
    const rt = await makeRuntime()
    rt.syncVehicles([makeVehicle('ego')])
    expect(rt.readVehicleState('ego')).toBeUndefined()
  })

  it('step advances vehicle pose and result is readable after awaiting', async () => {
    const rt = await makeRuntime()
    const vehicle = makeVehicle('ego', 1, 0, 0, 0, 0)
    rt.syncVehicles([vehicle])
    await rt.step(1.0)

    const state = rt.readVehicleState('ego')
    expect(state).toBeDefined()
    expect(state!.pose.x).toBeCloseTo(1)
    expect(state!.distanceTraveled).toBeCloseTo(1)
  })

  it('multiple steps accumulate distanceTraveled', async () => {
    const rt = await makeRuntime()
    const vehicle = makeVehicle('ego', 1, 0)
    rt.syncVehicles([vehicle])

    await rt.step(1.0)
    const s1 = rt.readVehicleState('ego')!
    vehicle.pose = new Pose2D(new Point2D(s1.pose.x, s1.pose.y), s1.pose.yaw)
    vehicle.distanceTraveled = s1.distanceTraveled

    rt.syncVehicles([vehicle])
    await rt.step(1.0)

    const s2 = rt.readVehicleState('ego')!
    expect(s2.distanceTraveled).toBeCloseTo(2)
  })

  it('vehicle removed from syncVehicles is still cached until overwritten', async () => {
    const rt = await makeRuntime()
    const a = makeVehicle('a', 1)
    const b = makeVehicle('b', 1)
    rt.syncVehicles([a, b])
    await rt.step(1.0)

    rt.syncVehicles([a])
    await rt.step(1.0)

    expect(rt.readVehicleState('a')).toBeDefined()
    expect(rt.readVehicleState('b')).toBeDefined() // cached from previous step
  })

  it('reset clears cached state synchronously', async () => {
    const rt = await makeRuntime()
    rt.syncVehicles([makeVehicle('ego', 1)])
    await rt.step(1.0)
    expect(rt.readVehicleState('ego')).toBeDefined()

    rt.reset()
    expect(rt.readVehicleState('ego')).toBeUndefined()
  })

  it('reset() during in-flight step discards stale response', async () => {
    let resolveStep!: (r: { vehicles: [] }) => void
    const slowClient: RemoteVehicleMotionClient = {
      initialize: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn().mockResolvedValue(undefined),
      syncVehicles: vi.fn().mockResolvedValue(undefined),
      step: vi.fn().mockReturnValue(new Promise((res) => { resolveStep = res })),
    }
    const rt = await RemoteVehicleMotionRuntime.create(slowClient)
    rt.syncVehicles([makeVehicle('ego', 1)])

    const stepPromise = rt.step(1.0)  // in-flight, not yet resolved

    // Reset invalidates the generation
    rt.reset()

    // Now let the step resolve
    resolveStep({ vehicles: [
      { vehicleId: 'ego', pose: { x: 5, y: 0, yaw: 0 }, velocity: { linear: 1, angular: 0 }, distanceTraveled: 5 },
    ] })
    await stepPromise

    // Stale result must not appear in state
    expect(rt.readVehicleState('ego')).toBeUndefined()
  })

  it('calls client.initialize() exactly once via create()', async () => {
    const client = new InMemoryRemoteVehicleMotionClient()
    const spy = vi.spyOn(client, 'initialize')
    await RemoteVehicleMotionRuntime.create(client)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not mutate the passed VehicleEntity', async () => {
    const rt = await makeRuntime()
    const vehicle = makeVehicle('ego', 1)
    const originalX = vehicle.pose.position.x
    rt.syncVehicles([vehicle])
    await rt.step(1.0)
    expect(vehicle.pose.position.x).toBe(originalX)
  })

  it('velocity is recorded in readVehicleState', async () => {
    const rt = await makeRuntime()
    rt.syncVehicles([makeVehicle('ego', 2, 0.5)])
    await rt.step(1.0)
    const state = rt.readVehicleState('ego')!
    expect(state.velocity.linear).toBeCloseTo(2)
    expect(state.velocity.angular).toBeCloseTo(0.5)
  })

  describe('operation ordering (slow backend simulation)', () => {
    it('step() waits for a slow syncVehicles before calling client.step()', async () => {
      let resolveSyncVehicles!: () => void
      const client: RemoteVehicleMotionClient = {
        initialize: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
        syncVehicles: vi.fn().mockReturnValue(
          new Promise<void>((res) => { resolveSyncVehicles = res }),
        ),
        step: vi.fn().mockResolvedValue({ vehicles: [] }),
      }
      const rt = await RemoteVehicleMotionRuntime.create(client)
      rt.syncVehicles([makeVehicle('ego')])

      const stepPromise = rt.step(1.0)
      // step() is waiting for syncVehicles, which hasn't resolved yet
      expect(client.step).not.toHaveBeenCalled()

      resolveSyncVehicles()
      await stepPromise

      expect(client.step).toHaveBeenCalledOnce()
    })

    it('step() waits for a slow reset() before calling client.step()', async () => {
      let resolveReset!: () => void
      const client: RemoteVehicleMotionClient = {
        initialize: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockReturnValue(
          new Promise<void>((res) => { resolveReset = res }),
        ),
        syncVehicles: vi.fn().mockResolvedValue(undefined),
        step: vi.fn().mockResolvedValue({ vehicles: [] }),
      }
      const rt = await RemoteVehicleMotionRuntime.create(client)
      rt.reset()
      rt.syncVehicles([])
      const stepPromise = rt.step(1.0)

      // step() is blocked behind the pending reset
      expect(client.step).not.toHaveBeenCalled()

      resolveReset()
      await stepPromise

      expect(client.step).toHaveBeenCalledOnce()
    })

    it('step() is ordered after syncVehicles even when syncVehicles fails', async () => {
      const client: RemoteVehicleMotionClient = {
        initialize: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
        syncVehicles: vi.fn().mockRejectedValue(new Error('sync failed')),
        step: vi.fn().mockResolvedValue({ vehicles: [] }),
      }
      const rt = await RemoteVehicleMotionRuntime.create(client)
      rt.syncVehicles([makeVehicle('ego')])

      // step() should still complete (chain error is swallowed)
      await expect(rt.step(1.0)).resolves.toBeUndefined()
      expect(client.step).toHaveBeenCalledOnce()
    })
  })

  describe('with mock client for boundary verification', () => {
    let client: RemoteVehicleMotionClient
    let stepSpy: ReturnType<typeof vi.fn>

    beforeEach(async () => {
      stepSpy = vi.fn().mockResolvedValue({ vehicles: [] })
      client = {
        initialize: vi.fn().mockResolvedValue(undefined),
        reset: vi.fn().mockResolvedValue(undefined),
        syncVehicles: vi.fn().mockResolvedValue(undefined),
        step: stepSpy,
      }
    })

    it('passes dt and commands to client.step()', async () => {
      const rt = await RemoteVehicleMotionRuntime.create(client)
      rt.syncVehicles([makeVehicle('ego', 1.5, 0.3)])
      await rt.step(0.05)

      expect(stepSpy).toHaveBeenCalledOnce()
      const call = stepSpy.mock.calls[0][0]
      expect(call.dt).toBe(0.05)
      expect(call.commands).toHaveLength(1)
      expect(call.commands[0].vehicleId).toBe('ego')
      expect(call.commands[0].linearVelocity).toBeCloseTo(1.5)
      expect(call.commands[0].angularVelocity).toBeCloseTo(0.3)
    })

    it('calls client.reset() on reset()', async () => {
      const rt = await RemoteVehicleMotionRuntime.create(client)
      rt.reset()
      await vi.waitFor(() => expect(client.reset).toHaveBeenCalledOnce())
    })
  })
})
