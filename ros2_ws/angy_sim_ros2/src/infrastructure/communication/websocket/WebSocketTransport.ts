import type {
  MessageHandler,
  TopicName,
  Transport,
} from '../../../simulation/communication/Transport'

/**
 * Wire-format envelope used by the WebSocket transport. The remote
 * peer is expected to use the same envelope (`{ topic, payload }`)
 * for every message in both directions. ROS / DDS / MQTT bridges with
 * their own framing should NOT reuse this transport — write a
 * dedicated `Transport` implementation instead.
 */
export interface WebSocketEnvelope {
  topic: string
  payload: unknown
}

export interface WebSocketTransportOptions {
  /** Optional injection point for tests (defaults to global WebSocket). */
  webSocketFactory?: (url: string) => WebSocket
}

/**
 * Bare-bones browser/Node WebSocket transport.
 *
 * Lifecycle:
 *   - `connect()` resolves on the socket's `open` event and rejects on
 *     a pre-open `error`. Re-calling `connect()` while connected is a
 *     no-op (idempotent).
 *   - `publish()` rejects if the socket is not open; this is intentional
 *     so callers see backpressure issues immediately rather than
 *     silently dropping telemetry.
 *   - `disconnect()` closes the socket and clears local handlers.
 *
 * This file MAY use the browser WebSocket API. It MUST NOT be imported
 * from `src/simulation` — only from app/infrastructure wiring.
 */
export class WebSocketTransport implements Transport {
  private socket: WebSocket | null = null
  private handlers = new Map<string, Set<MessageHandler<unknown>>>()
  private readonly url: string
  private readonly webSocketFactory: (url: string) => WebSocket

  constructor(url: string, options: WebSocketTransportOptions = {}) {
    this.url = url
    this.webSocketFactory =
      options.webSocketFactory ?? ((u) => new WebSocket(u))
  }

  async connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return
    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      await this.waitForOpen(this.socket)
      return
    }

    const socket = this.webSocketFactory(this.url)
    this.socket = socket

    socket.onmessage = (event: MessageEvent) => {
      this.handleIncoming(event.data)
    }

    await this.waitForOpen(socket)
  }

  async disconnect(): Promise<void> {
    const socket = this.socket
    if (!socket) return
    this.socket = null
    this.handlers.clear()

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close()
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  async publish<TMessage>(topic: TopicName, message: TMessage): Promise<void> {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(
        `WebSocketTransport: cannot publish to "${topic}" while not open`,
      )
    }

    const envelope: WebSocketEnvelope = { topic, payload: message }
    socket.send(JSON.stringify(envelope))
  }

  subscribe<TMessage>(
    topic: TopicName,
    handler: MessageHandler<TMessage>,
  ): () => void {
    let set = this.handlers.get(topic)
    if (!set) {
      set = new Set()
      this.handlers.set(topic, set)
    }
    set.add(handler as MessageHandler<unknown>)

    let active = true
    return () => {
      if (!active) return
      active = false
      this.handlers.get(topic)?.delete(handler as MessageHandler<unknown>)
    }
  }

  // -- internals --------------------------------------------------------

  private waitForOpen(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.OPEN) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const onOpen = () => {
        cleanup()
        resolve()
      }
      const onError = (event: Event) => {
        cleanup()
        reject(
          new Error(
            `WebSocketTransport: failed to open ${this.url} (${
              (event as ErrorEvent).message ?? 'error'
            })`,
          ),
        )
      }
      const cleanup = () => {
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('error', onError)
      }
      socket.addEventListener('open', onOpen, { once: true })
      socket.addEventListener('error', onError, { once: true })
    })
  }

  private handleIncoming(raw: unknown): void {
    if (typeof raw !== 'string') {
      // Binary frames are not supported by this transport. A future
      // protocol-buffer / FlatBuffers transport should be its own class.
      console.warn('[WebSocketTransport] dropping non-string frame')
      return
    }

    let envelope: WebSocketEnvelope
    try {
      const parsed = JSON.parse(raw) as unknown
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        typeof (parsed as { topic?: unknown }).topic !== 'string'
      ) {
        throw new Error('not a WebSocketEnvelope')
      }
      envelope = parsed as WebSocketEnvelope
    } catch (error) {
      console.warn(
        '[WebSocketTransport] failed to parse incoming frame:',
        (error as Error).message,
      )
      return
    }

    const set = this.handlers.get(envelope.topic)
    if (!set || set.size === 0) return

    for (const handler of [...set]) {
      try {
        ;(handler as MessageHandler<unknown>)(envelope.payload)
      } catch (error) {
        console.error(
          `[WebSocketTransport] handler for "${envelope.topic}" threw:`,
          error,
        )
      }
    }
  }
}
