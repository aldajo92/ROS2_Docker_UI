import type { Transport } from '../Transport'
import type { TopicBridge } from '../TopicBridge'
import type { MessageAdapter } from '../MessageAdapter'
import type { SimulationEngine } from '../../core/SimulationEngine'
import type { SimVehicleStateMessage } from '../messages/SimVehicleStateMessage'
import type { VehicleEntity } from '../../entities/VehicleEntity'

/**
 * Publishes the current state of a single vehicle.
 *
 * Drive this bridge through a `PeriodicPublisher` (so the publish
 * cadence is governed by simulation time, not wall-clock). The bridge
 * itself does NOT subscribe to events or own a timer — it is a passive
 * "publish this snapshot now" object.
 */
export class VehicleStatePublisherBridge implements TopicBridge {
  private started = false
  private readonly transport: Transport
  private readonly vehicleId: string
  private readonly topic: string
  private readonly engine: SimulationEngine
  private readonly adapter: MessageAdapter<unknown, SimVehicleStateMessage>

  constructor(
    transport: Transport,
    vehicleId: string,
    topic: string,
    engine: SimulationEngine,
    adapter: MessageAdapter<unknown, SimVehicleStateMessage>,
  ) {
    this.transport = transport
    this.vehicleId = vehicleId
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

  /**
   * Build a snapshot from the current engine state and ship it. Returns
   * silently when there's no vehicle / when stopped, so a stuck
   * publisher can't crash the simulation loop.
   */
  async publishOnce(): Promise<void> {
    if (!this.started) return

    const entity = this.engine.state.entities.get(this.vehicleId)
    if (!entity || entity.type !== 'vehicle') return

    const vehicle = entity as VehicleEntity

    const message: SimVehicleStateMessage = {
      id: vehicle.id,
      pose: {
        x: vehicle.pose.position.x,
        y: vehicle.pose.position.y,
        yaw: vehicle.pose.yaw,
      },
      velocity: vehicle.v,
      angularVelocity: vehicle.w,
    }

    const external = this.adapter.fromInternal(message)
    await this.transport.publish(this.topic, external)
  }
}
