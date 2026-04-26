import type { Transport } from '../Transport'
import type { TopicBridge } from '../TopicBridge'
import type { MessageAdapter } from '../MessageAdapter'
import type { Logger } from '../../logging/Logger'
import type { VehicleCommand } from '../../commands/VehicleCommand'
import type { VehicleCommandQueue } from '../../commands/VehicleCommandQueue'

/**
 * Inbound command bridge: subscribes to a topic, decodes each
 * message into a canonical `VehicleCommand`, and pushes it into the
 * shared `VehicleCommandQueue`.
 *
 * **It does not call `vehicle.setCommand(...)`.** That contract is
 * reserved for `VehicleCommandSystem`, which drains the queue during
 * the simulation tick. Routing is done by `vehicleId` carried in the
 * command payload — the bridge is therefore vehicle-agnostic and a
 * single instance can serve any number of vehicles published on the
 * same topic.
 *
 * Architectural rules enforced:
 *   - No reference to `SimulationEngine`, `EntityManager`, or any
 *     entity type. The bridge does not look up entities.
 *   - No imports from React / DOM / Three.js / ROS2 / DDS / WebSocket.
 *   - Adapter errors are logged through the optional `Logger` and
 *     dropped silently; one bad publisher must not stall the sim.
 *   - Commands with an unknown `vehicleId` are still queued — the
 *     decision to drop them belongs to `VehicleCommandSystem`, which
 *     has the only authoritative view of `state.entities`.
 */
export class VehicleCommandTopicBridge implements TopicBridge {
  private unsubscribe?: () => void

  private readonly transport: Transport
  private readonly topic: string
  private readonly commandQueue: VehicleCommandQueue
  private readonly adapter: MessageAdapter<unknown, VehicleCommand>
  private readonly logger?: Logger

  constructor(
    transport: Transport,
    topic: string,
    commandQueue: VehicleCommandQueue,
    adapter: MessageAdapter<unknown, VehicleCommand>,
    logger?: Logger,
  ) {
    this.transport = transport
    this.topic = topic
    this.commandQueue = commandQueue
    this.adapter = adapter
    this.logger = logger
  }

  async start(): Promise<void> {
    if (this.unsubscribe) return
    this.unsubscribe = this.transport.subscribe(this.topic, (rawMessage) => {
      let command: VehicleCommand
      try {
        command = this.adapter.toInternal(rawMessage)
      } catch (error) {
        this.logger?.warn(
          `[VehicleCommandTopicBridge] dropping malformed message on "${this.topic}": ${(error as Error).message}`,
        )
        return
      }

      // The adapter is responsible for guaranteeing a non-empty
      // `vehicleId`; this is a defense-in-depth check for adapter
      // implementations that might return a relaxed shape.
      if (typeof command.vehicleId !== 'string' || command.vehicleId.length === 0) {
        this.logger?.warn(
          `[VehicleCommandTopicBridge] dropping command with missing vehicleId on "${this.topic}"`,
        )
        return
      }

      this.commandQueue.push(command)
    })
  }

  async stop(): Promise<void> {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }
}
