import { describe, expect, it } from 'vitest'
import { MockTransport } from '../mock/MockTransport'
import { VehicleCommandQueue } from '../../../simulation/commands/VehicleCommandQueue'
import { VehicleCommandTopicBridge } from '../../../simulation/communication/bridges/VehicleCommandTopicBridge'
import { RosTwistToVehicleCommandAdapter } from './adapters/RosTwistToVehicleCommandAdapter'

/**
 * Architectural integration test.
 *
 * The point of this file is to prove — at the type system AND at
 * runtime — that `VehicleCommandTopicBridge` stays generic over any
 * `Transport` implementation, including when it consumes a ROS-shaped
 * adapter. We deliberately wire the existing `MockTransport` (NOT the
 * `RoslibRosbridgeTransport`) and run a `geometry_msgs/Twist` payload
 * through `RosTwistToVehicleCommandAdapter` into the bridge.
 *
 * If this file ever has to import roslib, or if `VehicleCommandTopicBridge`
 * grows a roslib dependency, the architecture has regressed.
 */
describe('VehicleCommandTopicBridge composes with the ROS Twist adapter via a generic Transport', () => {
  const TOPIC = '/cmd_vel'

  it('routes a Twist payload through the bridge into the command queue', async () => {
    const transport = new MockTransport()
    await transport.connect()

    const queue = new VehicleCommandQueue()
    const adapter = new RosTwistToVehicleCommandAdapter({ vehicleId: 'ego' })

    const bridge = new VehicleCommandTopicBridge(transport, TOPIC, queue, adapter)
    await bridge.start()

    await transport.publish(TOPIC, {
      linear: { x: 1.5, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: -0.25 },
    })

    expect(queue.size()).toBe(1)
    const [cmd] = queue.drain()
    expect(cmd).toEqual({
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: -0.25,
      source: 'external',
    })
  })

  it('stop() unsubscribes — late Twist publishes are dropped', async () => {
    const transport = new MockTransport()
    await transport.connect()

    const queue = new VehicleCommandQueue()
    const bridge = new VehicleCommandTopicBridge(
      transport,
      TOPIC,
      queue,
      new RosTwistToVehicleCommandAdapter(),
    )
    await bridge.start()
    await bridge.stop()

    await transport.publish(TOPIC, {
      linear: { x: 1, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    expect(queue.size()).toBe(0)
  })
})
