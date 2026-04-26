import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../../core/SimulationEngine'
import { MockTransport } from '../../../infrastructure/communication/mock/MockTransport'
import { JsonClockAdapter } from '../adapters/JsonClockAdapter'
import { ClockPublisherBridge } from './ClockPublisherBridge'

const TOPIC = '/sim/clock'

describe('ClockPublisherBridge', () => {
  it('publishes the current sim time, dt and tick count', async () => {
    const engine = new SimulationEngine()
    const transport = new MockTransport()
    await transport.connect()

    const bridge = new ClockPublisherBridge(
      transport,
      TOPIC,
      engine,
      new JsonClockAdapter(),
    )
    await bridge.start()

    engine.step(1 / 60)
    engine.step(1 / 60)

    await bridge.publishOnce()

    expect(transport.published).toHaveLength(1)
    const [{ topic, message }] = transport.published
    expect(topic).toBe(TOPIC)

    const m = message as { timeSec: number; dtSec: number; tick: number }
    expect(m.timeSec).toBeCloseTo(2 / 60)
    expect(m.dtSec).toBeCloseTo(1 / 60)
    expect(m.tick).toBe(2)
  })

  it('is silent before start()', async () => {
    const engine = new SimulationEngine()
    const transport = new MockTransport()
    await transport.connect()

    const bridge = new ClockPublisherBridge(
      transport,
      TOPIC,
      engine,
      new JsonClockAdapter(),
    )
    await bridge.publishOnce()
    expect(transport.published).toHaveLength(0)
  })

  it('is silent after stop()', async () => {
    const engine = new SimulationEngine()
    const transport = new MockTransport()
    await transport.connect()

    const bridge = new ClockPublisherBridge(
      transport,
      TOPIC,
      engine,
      new JsonClockAdapter(),
    )
    await bridge.start()
    await bridge.stop()
    await bridge.publishOnce()
    expect(transport.published).toHaveLength(0)
  })
})
