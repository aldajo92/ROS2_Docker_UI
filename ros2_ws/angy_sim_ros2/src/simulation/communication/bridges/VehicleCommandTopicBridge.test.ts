import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../../core/SimulationEngine'
import { VehicleEntity } from '../../entities/VehicleEntity'
import { Pose2D } from '../../../math/geometry/Pose2D'
import { MockTransport } from '../../../infrastructure/communication/mock/MockTransport'
import { JsonVehicleCommandAdapter } from '../adapters/JsonVehicleCommandAdapter'
import { VehicleCommandTopicBridge } from './VehicleCommandTopicBridge'

const TOPIC = '/control/ego/command'

async function makeRig() {
  const engine = new SimulationEngine()
  const transport = new MockTransport()
  await transport.connect()
  const ego = new VehicleEntity({ id: 'ego', pose: Pose2D.identity() })
  engine.addEntity(ego)
  const bridge = new VehicleCommandTopicBridge(
    transport,
    'ego',
    TOPIC,
    engine,
    new JsonVehicleCommandAdapter(),
  )
  await bridge.start()
  return { engine, transport, ego, bridge }
}

describe('VehicleCommandTopicBridge', () => {
  it('applies linear/angular velocity commands via setCommand', async () => {
    const { transport, ego } = await makeRig()
    await transport.publish(TOPIC, {
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: 0.25,
    })
    expect(ego.controls.v).toBeCloseTo(1.5)
    expect(ego.controls.w).toBeCloseTo(0.25)
  })

  it('preserves previously commanded fields when only one is sent', async () => {
    const { transport, ego } = await makeRig()
    ego.setControls({ v: 1.0, w: 0.5 })
    await transport.publish(TOPIC, { vehicleId: 'ego', angularVelocity: -0.2 })
    expect(ego.controls.v).toBeCloseTo(1.0)
    expect(ego.controls.w).toBeCloseTo(-0.2)
  })

  it('ignores commands targeted at a different vehicleId', async () => {
    const { transport, ego } = await makeRig()
    ego.setControls({ v: 0.7, w: 0 })
    await transport.publish(TOPIC, { vehicleId: 'other', linearVelocity: 999 })
    expect(ego.controls.v).toBeCloseTo(0.7)
  })

  it('drops malformed messages without throwing', async () => {
    const { transport, ego } = await makeRig()
    ego.setControls({ v: 0.4, w: 0 })
    await expect(
      transport.publish(TOPIC, { vehicleId: 42, linearVelocity: 1 }),
    ).resolves.toBeUndefined()
    expect(ego.controls.v).toBeCloseTo(0.4)
  })

  it('stop() unsubscribes — subsequent messages are ignored', async () => {
    const { transport, ego, bridge } = await makeRig()
    await bridge.stop()
    await transport.publish(TOPIC, { vehicleId: 'ego', linearVelocity: 9 })
    expect(ego.controls.v).toBeCloseTo(0)
  })
})
