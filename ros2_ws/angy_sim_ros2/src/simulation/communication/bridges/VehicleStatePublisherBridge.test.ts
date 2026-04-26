import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../../core/SimulationEngine'
import { VehicleEntity } from '../../entities/VehicleEntity'
import { Pose2D } from '../../../math/geometry/Pose2D'
import { MockTransport } from '../../../infrastructure/communication/mock/MockTransport'
import { JsonVehicleStateAdapter } from '../adapters/JsonVehicleStateAdapter'
import { VehicleStatePublisherBridge } from './VehicleStatePublisherBridge'

const TOPIC = '/sim/ego/state'

describe('VehicleStatePublisherBridge', () => {
  it('publishes a snapshot built from the current engine state', async () => {
    const engine = new SimulationEngine()
    const transport = new MockTransport()
    await transport.connect()

    const ego = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(1.0, 2.0, 0.5),
      controls: { v: 1.5, w: 0.25 },
    })
    engine.addEntity(ego)

    // Drive the entity's own update so `vehicle.v` / `.w` reflect the
    // last applied controls. We don't go through SimulationEngine.tick
    // here because the engine has no VehicleDynamicsSystem registered
    // by default — and this test is about the bridge, not the systems.
    ego.update(1 / 60, engine.state)

    const bridge = new VehicleStatePublisherBridge(
      transport,
      'ego',
      TOPIC,
      engine,
      new JsonVehicleStateAdapter(),
    )
    await bridge.start()

    await bridge.publishOnce()

    expect(transport.published).toHaveLength(1)
    const [{ topic, message }] = transport.published
    expect(topic).toBe(TOPIC)

    const m = message as {
      id: string
      pose: { x: number; y: number; yaw: number }
      velocity: number
      angularVelocity: number
    }
    expect(m.id).toBe('ego')
    expect(m.velocity).toBeCloseTo(1.5)
    expect(m.angularVelocity).toBeCloseTo(0.25)
    expect(m.pose.x).toBeGreaterThan(1.0)
    expect(m.pose.y).toBeGreaterThan(2.0)
  })

  it('is silent when the target vehicle is not in the scene', async () => {
    const engine = new SimulationEngine()
    const transport = new MockTransport()
    await transport.connect()

    const bridge = new VehicleStatePublisherBridge(
      transport,
      'missing',
      TOPIC,
      engine,
      new JsonVehicleStateAdapter(),
    )
    await bridge.start()

    await bridge.publishOnce()
    expect(transport.published).toHaveLength(0)
  })

  it('is silent when stopped', async () => {
    const engine = new SimulationEngine()
    const transport = new MockTransport()
    await transport.connect()
    engine.addEntity(new VehicleEntity({ id: 'ego' }))

    const bridge = new VehicleStatePublisherBridge(
      transport,
      'ego',
      TOPIC,
      engine,
      new JsonVehicleStateAdapter(),
    )
    // start() never called; should not publish
    await bridge.publishOnce()
    expect(transport.published).toHaveLength(0)
  })
})
