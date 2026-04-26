/**
 * Tiny typed pub/sub. Generic over an EventMap so consumers get
 * compile-time checks on event names and payload shapes.
 *
 * Why not RxJS or eventemitter3? Bundle size + zero deps in the core.
 */

export type EventHandler<T> = (payload: T) => void

export interface EventBus<EventMap extends Record<string, unknown>> {
  on<K extends keyof EventMap & string>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): () => void
  off<K extends keyof EventMap & string>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): void
  emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void
}

export class TypedEventBus<EventMap extends Record<string, unknown>>
  implements EventBus<EventMap>
{
  private handlers = new Map<string, Set<EventHandler<unknown>>>()

  on<K extends keyof EventMap & string>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): () => void {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set()
      this.handlers.set(event, set)
    }
    set.add(handler as EventHandler<unknown>)
    return () => this.off(event, handler)
  }

  off<K extends keyof EventMap & string>(
    event: K,
    handler: EventHandler<EventMap[K]>,
  ): void {
    this.handlers.get(event)?.delete(handler as EventHandler<unknown>)
  }

  emit<K extends keyof EventMap & string>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event)
    if (!set || set.size === 0) return
    // Snapshot so handlers can unsubscribe themselves without mutating mid-iteration.
    for (const h of [...set]) (h as EventHandler<EventMap[K]>)(payload)
  }

  clear(): void {
    this.handlers.clear()
  }
}
