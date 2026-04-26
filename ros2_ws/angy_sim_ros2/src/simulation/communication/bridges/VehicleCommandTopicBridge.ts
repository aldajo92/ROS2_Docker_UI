import type { Transport } from '../Transport'
import type { TopicBridge } from '../TopicBridge'
import type { MessageAdapter } from '../MessageAdapter'
import type { SimulationEngine } from '../../core/SimulationEngine'
import type { SimVehicleCommandMessage } from '../messages/SimVehicleCommandMessage'
import { VehicleEntity } from '../../entities/VehicleEntity'

/**
 * Subscribes to an inbound command topic and applies the decoded
 * command to a `VehicleEntity` via its public `setCommand` API.
 *
 * Behavior:
 *   - Messages whose `vehicleId` doesn't match this bridge's target are
 *     ignored (multi-vehicle scenarios can run several bridges).
 *   - Adapter errors and missing entities are logged through the
 *     engine logger and otherwise swallowed; one bad publisher must
 *     not stall the simulation.
 */
export class VehicleCommandTopicBridge implements TopicBridge {
  private unsubscribe?: () => void
  private readonly transport: Transport
  private readonly vehicleId: string
  private readonly topic: string
  private readonly engine: SimulationEngine
  private readonly adapter: MessageAdapter<unknown, SimVehicleCommandMessage>

  constructor(
    transport: Transport,
    vehicleId: string,
    topic: string,
    engine: SimulationEngine,
    adapter: MessageAdapter<unknown, SimVehicleCommandMessage>,
  ) {
    this.transport = transport
    this.vehicleId = vehicleId
    this.topic = topic
    this.engine = engine
    this.adapter = adapter
  }

  async start(): Promise<void> {
    if (this.unsubscribe) return
    this.unsubscribe = this.transport.subscribe(this.topic, (rawMessage) => {
      let command: SimVehicleCommandMessage
      try {
        command = this.adapter.toInternal(rawMessage)
      } catch (error) {
        this.engine.logger.warn(
          `[VehicleCommandTopicBridge] dropping malformed message on "${this.topic}": ${(error as Error).message}`,
        )
        return
      }

      if (command.vehicleId !== this.vehicleId) return

      const entity = this.engine.state.entities.get(this.vehicleId)
      if (!entity || entity.type !== 'vehicle') {
        this.engine.logger.warn(
          `[VehicleCommandTopicBridge] no vehicle "${this.vehicleId}" in scene`,
        )
        return
      }

      const vehicle = entity as VehicleEntity
      vehicle.setCommand({
        linearVelocity: command.linearVelocity,
        angularVelocity: command.angularVelocity,
        throttle: command.throttle,
        brake: command.brake,
        steering: command.steering,
      })
    })
  }

  async stop(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }
}
