import type {
  MessageHandler,
  TopicName,
  Transport,
} from '../../../simulation/communication/Transport'
import type { Logger } from '../../../simulation/logging/Logger'

/**
 * Concrete `Transport` over rosbridge_server using `roslibjs`.
 *
 * **This is the only file in the simulator allowed to depend on
 * `roslibjs`.** Everything else — engine, systems, bridges, adapters,
 * other transports — talks to the generic {@link Transport} contract,
 * so the simulator can be retargeted at any wire format (DDS, MQTT,
 * native WebSocket, WebRTC, …) by writing a new `Transport`
 * implementation under `src/infrastructure/communication/<vendor>/`
 * and switching one line in `CommunicationProvider`.
 *
 * Design notes:
 *
 *   - **Factory injection.** The constructor accepts `rosFactory` and
 *     `topicFactory` defaulting to roslib's real `Ros` / `Topic`. Tests
 *     pass fakes so the transport can be exercised without a live
 *     rosbridge server (and without loading roslib at module-level).
 *   - **Lazy topic creation.** roslib's `Topic` carries a per-topic
 *     `messageType` (e.g. `geometry_msgs/msg/Twist`). The simulator's
 *     `Transport` interface is intentionally type-agnostic, so the
 *     ROS message type must be supplied by the caller via
 *     `topicTypes`. Calling `publish` / `subscribe` on a topic that
 *     isn't in the map throws a clear error rather than silently
 *     defaulting.
 *   - **Status callback.** An optional `onStatusChange` listener is
 *     called with `'connecting' | 'connected' | 'disconnected' |
 *     'error'`. This is rosbridge-specific UI plumbing — it lives on
 *     the concrete class, NOT on the `Transport` interface, so the
 *     simulation core stays unaware of it.
 */

export type RosbridgeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export type RosbridgeStatusListener = (
  status: RosbridgeStatus,
  errorMessage?: string,
) => void

/** Subset of `roslib`'s `Ros` API used by this transport. */
export interface RosLike {
  readonly isConnected: boolean
  connect(url: string): Promise<void>
  close(): void
  on(event: 'connection', listener: () => void): unknown
  on(event: 'error', listener: (event: unknown) => void): unknown
  on(event: 'close', listener: () => void): unknown
  off(event: 'connection', listener: () => void): unknown
  off(event: 'error', listener: (event: unknown) => void): unknown
  off(event: 'close', listener: () => void): unknown
}

/** Subset of `roslib`'s `Topic` API used by this transport. */
export interface TopicLike<T = unknown> {
  publish(message: T): void
  subscribe(callback: (message: T) => void): void
  unsubscribe(callback?: (message: T) => void): void
  advertise(): void
  unadvertise(): void
}

export type RosFactory = (options: { url: string }) => RosLike
export type TopicFactory = <T = unknown>(args: {
  ros: RosLike
  name: string
  messageType: string
}) => TopicLike<T>

export interface RoslibRosbridgeTransportOptions {
  url: string
  /**
   * Topic-name → ROS message type (e.g. `'/cmd_vel'` →
   * `'geometry_msgs/msg/Twist'`). roslib requires a `messageType` per
   * `Topic`; we keep that mapping outside the simulation core.
   */
  topicTypes: Record<TopicName, string>
  rosFactory: RosFactory
  topicFactory: TopicFactory
  logger?: Logger
  /** Receives transport status transitions; called synchronously. */
  onStatusChange?: RosbridgeStatusListener
}

interface InternalSubscription {
  topic: TopicLike<unknown>
  handlers: Set<MessageHandler<unknown>>
  fanout: (message: unknown) => void
}

interface InternalPublisher {
  topic: TopicLike<unknown>
}

export class RoslibRosbridgeTransport implements Transport {
  private readonly url: string
  private readonly topicTypes: Record<string, string>
  private readonly rosFactory: RosFactory
  private readonly topicFactory: TopicFactory
  private readonly logger?: Logger
  private statusListeners = new Set<RosbridgeStatusListener>()

  private ros: RosLike | null = null
  private subscriptions = new Map<string, InternalSubscription>()
  private publishers = new Map<string, InternalPublisher>()
  private status: RosbridgeStatus = 'disconnected'
  private connecting: Promise<void> | null = null

  constructor(options: RoslibRosbridgeTransportOptions) {
    if (typeof options.url !== 'string' || options.url.length === 0) {
      throw new Error('RoslibRosbridgeTransport: url must be a non-empty string')
    }
    this.url = options.url
    this.topicTypes = { ...options.topicTypes }
    this.rosFactory = options.rosFactory
    this.topicFactory = options.topicFactory
    this.logger = options.logger
    if (options.onStatusChange) this.statusListeners.add(options.onStatusChange)
  }

  /* -- Transport ------------------------------------------------------- */

  async connect(): Promise<void> {
    if (this.status === 'connected' && this.ros?.isConnected) return
    if (this.connecting) return this.connecting

    this.setStatus('connecting')

    const ros = this.rosFactory({ url: this.url })
    this.ros = ros

    const onConnection = () => this.setStatus('connected')
    const onClose = () => {
      // Spurious close after `disconnect()` is fine — the manual path
      // already set status to 'disconnected'. Only react when the
      // socket goes away unexpectedly.
      if (this.status !== 'disconnected') this.setStatus('disconnected')
    }
    const onError = (event: unknown) => {
      this.setStatus('error', formatError(event))
    }

    ros.on('connection', onConnection)
    ros.on('close', onClose)
    ros.on('error', onError)

    this.connecting = (async () => {
      try {
        await ros.connect(this.url)
        // roslib emits 'connection' on the underlying transport open;
        // we already wired `onConnection` above. If the implementation
        // resolves without emitting (e.g. a synchronous fake), make
        // sure the status reflects that we're up.
        if (ros.isConnected && this.status !== 'connected') {
          this.setStatus('connected')
        }
      } catch (err) {
        this.setStatus('error', formatError(err))
        throw err
      } finally {
        this.connecting = null
      }
    })()

    return this.connecting
  }

  async disconnect(): Promise<void> {
    const ros = this.ros
    if (!ros) {
      this.setStatus('disconnected')
      return
    }

    // Tear down topic-level handles before closing the socket so the
    // underlying library doesn't receive late frames after we drop our
    // local maps.
    for (const sub of this.subscriptions.values()) {
      try {
        sub.topic.unsubscribe(sub.fanout)
      } catch (err) {
        this.logger?.warn(
          `[RoslibRosbridgeTransport] unsubscribe failed: ${formatError(err)}`,
        )
      }
    }
    for (const pub of this.publishers.values()) {
      try {
        pub.topic.unadvertise()
      } catch (err) {
        this.logger?.warn(
          `[RoslibRosbridgeTransport] unadvertise failed: ${formatError(err)}`,
        )
      }
    }
    this.subscriptions.clear()
    this.publishers.clear()

    try {
      ros.close()
    } catch (err) {
      this.logger?.warn(
        `[RoslibRosbridgeTransport] close failed: ${formatError(err)}`,
      )
    }
    this.ros = null
    this.setStatus('disconnected')
  }

  isConnected(): boolean {
    return this.status === 'connected' && Boolean(this.ros?.isConnected)
  }

  async publish<TMessage>(
    topic: TopicName,
    message: TMessage,
  ): Promise<void> {
    if (!this.ros) {
      throw new Error(
        `RoslibRosbridgeTransport: cannot publish "${topic}" before connect()`,
      )
    }

    let handle = this.publishers.get(topic)
    if (!handle) {
      const messageType = this.requireMessageType(topic)
      const t = this.topicFactory<unknown>({
        ros: this.ros,
        name: topic,
        messageType,
      })
      try {
        t.advertise()
      } catch (err) {
        this.logger?.warn(
          `[RoslibRosbridgeTransport] advertise("${topic}") failed: ${formatError(err)}`,
        )
      }
      handle = { topic: t }
      this.publishers.set(topic, handle)
    }

    handle.topic.publish(message as unknown)
  }

  subscribe<TMessage>(
    topic: TopicName,
    handler: MessageHandler<TMessage>,
  ): () => void {
    if (!this.ros) {
      throw new Error(
        `RoslibRosbridgeTransport: cannot subscribe "${topic}" before connect()`,
      )
    }

    let sub = this.subscriptions.get(topic)
    if (!sub) {
      const messageType = this.requireMessageType(topic)
      const rosTopic = this.topicFactory<unknown>({
        ros: this.ros,
        name: topic,
        messageType,
      })
      const handlers = new Set<MessageHandler<unknown>>()
      const fanout = (message: unknown) => {
        // Snapshot to allow handlers to unsubscribe themselves without
        // perturbing iteration.
        for (const fn of [...handlers]) {
          try {
            fn(message)
          } catch (err) {
            this.logger?.error(
              `[RoslibRosbridgeTransport] handler for "${topic}" threw: ${formatError(err)}`,
            )
          }
        }
      }
      rosTopic.subscribe(fanout)
      sub = { topic: rosTopic, handlers, fanout }
      this.subscriptions.set(topic, sub)
    }

    sub.handlers.add(handler as MessageHandler<unknown>)

    let active = true
    return () => {
      if (!active) return
      active = false
      const current = this.subscriptions.get(topic)
      if (!current) return
      current.handlers.delete(handler as MessageHandler<unknown>)
      if (current.handlers.size === 0) {
        try {
          current.topic.unsubscribe(current.fanout)
        } catch (err) {
          this.logger?.warn(
            `[RoslibRosbridgeTransport] unsubscribe("${topic}") failed: ${formatError(err)}`,
          )
        }
        this.subscriptions.delete(topic)
      }
    }
  }

  /* -- rosbridge-specific surface (NOT part of Transport) ------------- */

  /** Current connection status. Cheap synchronous read. */
  getStatus(): RosbridgeStatus {
    return this.status
  }

  /**
   * Subscribe to status transitions. Returns an idempotent unsubscribe.
   * The listener fires synchronously for every transition. We do NOT
   * replay the current status on subscribe — call `getStatus()` for
   * that.
   */
  onStatusChange(listener: RosbridgeStatusListener): () => void {
    this.statusListeners.add(listener)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.statusListeners.delete(listener)
    }
  }

  /* -- internals ------------------------------------------------------- */

  private requireMessageType(topic: string): string {
    const t = this.topicTypes[topic]
    if (!t) {
      throw new Error(
        `RoslibRosbridgeTransport: no ROS message type configured for topic "${topic}". ` +
          'Add it to RoslibRosbridgeTransportOptions.topicTypes.',
      )
    }
    return t
  }

  private setStatus(status: RosbridgeStatus, errorMessage?: string): void {
    if (this.status === status) return
    this.status = status
    for (const listener of [...this.statusListeners]) {
      try {
        listener(status, errorMessage)
      } catch (err) {
        // A buggy status listener must not stall the rest of the
        // transport — treat it like a renderer event-handler failure.
        console.error(
          '[RoslibRosbridgeTransport] status listener threw:',
          err,
        )
      }
    }
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}
