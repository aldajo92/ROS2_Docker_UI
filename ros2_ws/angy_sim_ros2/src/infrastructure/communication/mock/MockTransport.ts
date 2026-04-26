import type {
  MessageHandler,
  TopicName,
  Transport,
} from '../../../simulation/communication/Transport'

/**
 * In-process transport intended for unit tests.
 *
 * Behavior choices (documented because they're contract-relevant):
 *
 *   - `publish` resolves synchronously after dispatching to all
 *     subscribers; it does NOT defer to a microtask, which keeps tests
 *     simple and deterministic.
 *   - When `connected` is false, `publish` rejects. This lets tests
 *     assert correct lifecycle handling.
 *   - `disconnect` keeps subscriptions intact, so a reconnect-and-keep-
 *     listening pattern works without re-subscribing. Use `clear()` to
 *     wipe handlers explicitly.
 *   - Handler exceptions are caught and logged via `console.error` so
 *     one broken subscriber can't poison the rest.
 */
export class MockTransport implements Transport {
  private connected = false
  private handlers = new Map<string, Set<MessageHandler<unknown>>>()
  /** Every published message, in order. Useful for test assertions. */
  readonly published: Array<{ topic: string; message: unknown }> = []

  async connect(): Promise<void> {
    this.connected = true
  }

  async disconnect(): Promise<void> {
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }

  async publish<TMessage>(topic: TopicName, message: TMessage): Promise<void> {
    if (!this.connected) {
      throw new Error(`MockTransport: cannot publish to "${topic}" while disconnected`)
    }
    this.published.push({ topic, message })

    const set = this.handlers.get(topic)
    if (!set || set.size === 0) return
    for (const handler of [...set]) {
      try {
        ;(handler as MessageHandler<TMessage>)(message)
      } catch (error) {
        console.error(
          `[MockTransport] handler for "${topic}" threw:`,
          error,
        )
      }
    }
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

  /** Test helper: drop every handler regardless of topic. */
  clear(): void {
    this.handlers.clear()
    this.published.length = 0
  }
}
