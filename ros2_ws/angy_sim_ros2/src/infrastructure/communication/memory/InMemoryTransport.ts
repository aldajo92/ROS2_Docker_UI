import type {
  MessageHandler,
  TopicName,
  Transport,
} from '../../../simulation/communication/Transport'

/**
 * In-process transport for local development. Same wire model as
 * `MockTransport`, but with two production-friendly tweaks:
 *
 *   - `publish` dispatches asynchronously via `queueMicrotask` so
 *     publishers never re-enter their own subscribers within the same
 *     synchronous frame (avoids surprising recursion bugs that don't
 *     show up against a real network).
 *   - `disconnect` clears every subscription, matching the typical
 *     behavior of a real transport whose remote peer goes away.
 *
 * Two `InMemoryTransport` instances are independent — pair them with a
 * shared bus or wire them together explicitly if you need cross-tab /
 * cross-worker delivery.
 */
export class InMemoryTransport implements Transport {
  private connected = false
  private handlers = new Map<string, Set<MessageHandler<unknown>>>()

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
    this.handlers.clear()
  }

  isConnected(): boolean {
    return this.connected
  }

  async publish<TMessage>(topic: TopicName, message: TMessage): Promise<void> {
    if (!this.connected) {
      throw new Error(
        `InMemoryTransport: cannot publish to "${topic}" while disconnected`,
      )
    }

    const set = this.handlers.get(topic)
    if (!set || set.size === 0) return

    const snapshot = [...set]
    queueMicrotask(() => {
      for (const handler of snapshot) {
        try {
          ;(handler as MessageHandler<TMessage>)(message)
        } catch (error) {
          console.error(
            `[InMemoryTransport] handler for "${topic}" threw:`,
            error,
          )
        }
      }
    })
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
}
