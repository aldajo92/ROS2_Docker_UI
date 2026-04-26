/**
 * Generic, transport-agnostic message bus contract.
 *
 * A `Transport` is responsible for nothing more than delivering opaque
 * messages between named topics. It must NOT know about:
 *
 *   - simulator entities or systems,
 *   - rendering,
 *   - ROS2 / DDS / rosbridge / MQTT message catalogs,
 *   - browser-only or Node-only timers.
 *
 * Concrete implementations live under `src/infrastructure/communication`
 * (mock, in-memory, WebSocket, …). The simulation core only depends on
 * this interface so that any transport can be swapped in later.
 */

export type TopicName = string

export type MessageHandler<TMessage = unknown> = (message: TMessage) => void

export interface Transport {
  connect(): Promise<void>
  disconnect(): Promise<void>

  isConnected(): boolean

  publish<TMessage>(topic: TopicName, message: TMessage): Promise<void>

  /**
   * Subscribe to a topic. Returns an idempotent unsubscribe function;
   * calling it more than once is a no-op.
   */
  subscribe<TMessage>(
    topic: TopicName,
    handler: MessageHandler<TMessage>,
  ): () => void
}
