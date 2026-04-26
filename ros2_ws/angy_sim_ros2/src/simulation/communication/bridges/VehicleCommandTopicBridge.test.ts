import { describe, expect, it, vi } from 'vitest'
import { VehicleCommandQueue } from '../../commands/VehicleCommandQueue'
import { Logger } from '../../logging/Logger'
import type { LogLevel, LoggerSink } from '../../logging/Logger'
import { MockTransport } from '../../../infrastructure/communication/mock/MockTransport'
import { JsonVehicleCommandAdapter } from '../adapters/JsonVehicleCommandAdapter'
import { VehicleCommandTopicBridge } from './VehicleCommandTopicBridge'

const TOPIC = '/control/ego/command'

class CapturingSink implements LoggerSink {
  readonly entries: Array<{ level: LogLevel; args: unknown[] }> = []
  write(level: LogLevel, args: unknown[]): void {
    this.entries.push({ level, args })
  }
}

async function makeRig() {
  const transport = new MockTransport()
  await transport.connect()
  const commandQueue = new VehicleCommandQueue()
  const sink = new CapturingSink()
  const logger = new Logger(sink, 'debug')
  const bridge = new VehicleCommandTopicBridge(
    transport,
    TOPIC,
    commandQueue,
    new JsonVehicleCommandAdapter(),
    logger,
  )
  await bridge.start()
  return { transport, commandQueue, bridge, logger, sink }
}

describe('VehicleCommandTopicBridge', () => {
  it('subscribes on start and unsubscribes on stop', async () => {
    const transport = new MockTransport()
    await transport.connect()
    const subscribeSpy = vi.spyOn(transport, 'subscribe')
    const queue = new VehicleCommandQueue()
    const bridge = new VehicleCommandTopicBridge(
      transport,
      TOPIC,
      queue,
      new JsonVehicleCommandAdapter(),
    )

    await bridge.start()
    expect(subscribeSpy).toHaveBeenCalledTimes(1)
    expect(subscribeSpy.mock.calls[0]?.[0]).toBe(TOPIC)

    await transport.publish(TOPIC, { vehicleId: 'ego', linearVelocity: 1 })
    expect(queue.size()).toBe(1)

    await bridge.stop()
    await transport.publish(TOPIC, { vehicleId: 'ego', linearVelocity: 99 })
    // Still 1 — the post-stop publish must not enqueue.
    expect(queue.size()).toBe(1)
  })

  it('decodes the raw payload through the adapter and pushes the result', async () => {
    const { transport, commandQueue } = await makeRig()
    await transport.publish(TOPIC, {
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: -0.25,
      timestampSec: 12.5,
    })

    expect(commandQueue.size()).toBe(1)
    const [cmd] = commandQueue.drain()
    expect(cmd).toMatchObject({
      vehicleId: 'ego',
      linearVelocity: 1.5,
      angularVelocity: -0.25,
      timestampSec: 12.5,
      source: 'external', // adapter default for transport-borne commands
    })
  })

  it('queues commands for unknown vehicles — routing decision belongs to VehicleCommandSystem', async () => {
    const { transport, commandQueue } = await makeRig()
    await transport.publish(TOPIC, { vehicleId: 'phantom', linearVelocity: 2 })
    expect(commandQueue.size()).toBe(1)
    expect(commandQueue.drain()[0]?.vehicleId).toBe('phantom')
  })

  it('drops malformed messages, logs a warning, and does not enqueue', async () => {
    const { transport, commandQueue, sink } = await makeRig()
    await expect(
      transport.publish(TOPIC, { vehicleId: 42, linearVelocity: 1 }),
    ).resolves.toBeUndefined()

    expect(commandQueue.size()).toBe(0)
    expect(sink.entries.some((e) => e.level === 'warn')).toBe(true)
  })

  it('does not require a Logger to be supplied', async () => {
    const transport = new MockTransport()
    await transport.connect()
    const queue = new VehicleCommandQueue()
    const bridge = new VehicleCommandTopicBridge(
      transport,
      TOPIC,
      queue,
      new JsonVehicleCommandAdapter(),
    )
    await bridge.start()

    // Malformed publish must not throw even when no logger is wired.
    await expect(
      transport.publish(TOPIC, { vehicleId: '', linearVelocity: 1 }),
    ).resolves.toBeUndefined()
    expect(queue.size()).toBe(0)

    await bridge.stop()
  })

  it('does not couple to SimulationEngine or VehicleEntity', async () => {
    // Compile-time evidence is the constructor signature itself; this
    // runtime test pins that the bridge can be wired with **only** a
    // transport, topic, queue, and adapter — no engine, no entities.
    const transport = new MockTransport()
    await transport.connect()
    const queue = new VehicleCommandQueue()
    const bridge = new VehicleCommandTopicBridge(
      transport,
      TOPIC,
      queue,
      new JsonVehicleCommandAdapter(),
    )
    await bridge.start()
    await transport.publish(TOPIC, { vehicleId: 'ego', linearVelocity: 0.5 })
    expect(queue.size()).toBe(1)
    await bridge.stop()
  })
})
