import type { Transport } from '../Transport'
import type { TopicBridge } from '../TopicBridge'
import type { MessageAdapter } from '../MessageAdapter'
import type { SimulationEngine } from '../../core/SimulationEngine'
import type { SimClockMessage } from '../messages/SimClockMessage'

/**
 * Publishes the simulation clock periodically. Like
 * `VehicleStatePublisherBridge`, this is a passive "snapshot now"
 * object — drive it through a `PeriodicPublisher` so the rate scales
 * with simulation time.
 */
export class ClockPublisherBridge implements TopicBridge {
  private started = false
  private readonly transport: Transport
  private readonly topic: string
  private readonly engine: SimulationEngine
  private readonly adapter: MessageAdapter<unknown, SimClockMessage>

  constructor(
    transport: Transport,
    topic: string,
    engine: SimulationEngine,
    adapter: MessageAdapter<unknown, SimClockMessage>,
  ) {
    this.transport = transport
    this.topic = topic
    this.engine = engine
    this.adapter = adapter
  }

  async start(): Promise<void> {
    this.started = true
  }

  async stop(): Promise<void> {
    this.started = false
  }

  async publishOnce(): Promise<void> {
    if (!this.started) return

    const { clock, metrics } = this.engine.state

    const message: SimClockMessage = {
      timeSec: clock.time(),
      dtSec: clock.dt(),
      tick: metrics.ticks,
    }

    const external = this.adapter.fromInternal(message)
    await this.transport.publish(this.topic, external)
  }
}
