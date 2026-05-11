import { describe, expect, it, beforeEach } from 'vitest'
import { InMemoryRemoteVehicleMotionClient } from './InMemoryRemoteVehicleMotionClient'

describe('InMemoryRemoteVehicleMotionClient', () => {
  let client: InMemoryRemoteVehicleMotionClient

  beforeEach(() => {
    client = new InMemoryRemoteVehicleMotionClient()
  })

  it('step with no vehicles returns empty result', async () => {
    const result = await client.step({ dt: 1.0, commands: [] })
    expect(result.vehicles).toHaveLength(0)
  })

  it('step advances vehicle pose (straight ahead, v=1 for 1s)', async () => {
    await client.syncVehicles([{ vehicleId: 'ego', pose: { x: 0, y: 0, yaw: 0 } }])
    const result = await client.step({
      dt: 1.0,
      commands: [{ vehicleId: 'ego', linearVelocity: 1, angularVelocity: 0 }],
    })
    expect(result.vehicles).toHaveLength(1)
    expect(result.vehicles[0].pose.x).toBeCloseTo(1)
    expect(result.vehicles[0].pose.y).toBeCloseTo(0)
    expect(result.vehicles[0].pose.yaw).toBeCloseTo(0)
  })

  it('step accumulates distanceTraveled across multiple steps', async () => {
    await client.syncVehicles([{ vehicleId: 'ego', pose: { x: 0, y: 0, yaw: 0 } }])
    const cmd = { vehicleId: 'ego', linearVelocity: 1, angularVelocity: 0 }
    await client.step({ dt: 1.0, commands: [cmd] })
    const result = await client.step({ dt: 1.0, commands: [cmd] })
    expect(result.vehicles[0].distanceTraveled).toBeCloseTo(2)
  })

  it('step with unknown vehicle is silently skipped', async () => {
    const result = await client.step({
      dt: 1.0,
      commands: [{ vehicleId: 'unknown', linearVelocity: 1, angularVelocity: 0 }],
    })
    expect(result.vehicles).toHaveLength(0)
  })

  it('syncVehicles removes deregistered vehicles', async () => {
    await client.syncVehicles([
      { vehicleId: 'a', pose: { x: 0, y: 0, yaw: 0 } },
      { vehicleId: 'b', pose: { x: 1, y: 0, yaw: 0 } },
    ])
    await client.syncVehicles([{ vehicleId: 'a', pose: { x: 0, y: 0, yaw: 0 } }])
    const result = await client.step({
      dt: 1.0,
      commands: [
        { vehicleId: 'a', linearVelocity: 1, angularVelocity: 0 },
        { vehicleId: 'b', linearVelocity: 1, angularVelocity: 0 },
      ],
    })
    expect(result.vehicles.map((v) => v.vehicleId)).toEqual(['a'])
  })

  it('reset clears all vehicle state', async () => {
    await client.syncVehicles([{ vehicleId: 'ego', pose: { x: 0, y: 0, yaw: 0 } }])
    await client.step({ dt: 1.0, commands: [{ vehicleId: 'ego', linearVelocity: 1, angularVelocity: 0 }] })
    await client.reset()
    const result = await client.step({
      dt: 1.0,
      commands: [{ vehicleId: 'ego', linearVelocity: 1, angularVelocity: 0 }],
    })
    expect(result.vehicles).toHaveLength(0)
  })

  it('velocity fields reflect the commanded velocities', async () => {
    await client.syncVehicles([{ vehicleId: 'ego', pose: { x: 0, y: 0, yaw: 0 } }])
    const result = await client.step({
      dt: 1.0,
      commands: [{ vehicleId: 'ego', linearVelocity: 2, angularVelocity: 0.5 }],
    })
    expect(result.vehicles[0].velocity.linear).toBeCloseTo(2)
    expect(result.vehicles[0].velocity.angular).toBeCloseTo(0.5)
  })

  it('yaw wraps into [-π, π] range', async () => {
    await client.syncVehicles([{ vehicleId: 'ego', pose: { x: 0, y: 0, yaw: Math.PI - 0.1 } }])
    const result = await client.step({
      dt: 1.0,
      commands: [{ vehicleId: 'ego', linearVelocity: 0, angularVelocity: 0.2 }],
    })
    const yaw = result.vehicles[0].pose.yaw
    expect(yaw).toBeGreaterThanOrEqual(-Math.PI)
    expect(yaw).toBeLessThanOrEqual(Math.PI)
  })

  it('initialize resolves without error', async () => {
    await expect(client.initialize()).resolves.toBeUndefined()
  })
})
