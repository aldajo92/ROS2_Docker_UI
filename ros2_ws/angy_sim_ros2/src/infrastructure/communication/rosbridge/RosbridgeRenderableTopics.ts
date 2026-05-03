import type {
  RenderableTopicCapability,
  RenderableTopicSelection,
  RenderableTopicSupport,
} from '../../../app/RenderableTopics'
import {
  RENDERABLE_TOPIC_WHITELIST,
  RENDER_UNSUPPORTED_REASON,
  findRenderableSupport,
} from '../../../app/RenderableTopics'
import type { TopicInfo } from '../../../app/TopicDiscovery'
import type { ExternalPathUpdateQueue } from '../../../simulation/paths/ExternalPathUpdateQueue'
import type { Path2D } from '../../../simulation/paths/Path2D'
import { RosPathToPath2DAdapter } from './adapters/RosPathToPath2DAdapter'

/**
 * Rosbridge-flavoured implementation of the generic
 * {@link RenderableTopicCapability}. Owns one rosbridge subscription
 * per selected topic, and pushes mutations into a simulation-side
 * `ExternalPathUpdateQueue` (drained by `ExternalPathRenderSystem`
 * during the next tick) instead of touching `SimulationState`
 * directly.
 *
 * This file deliberately does NOT import `roslib`. It works against
 * the small `RenderableSubscriber` adapter the wider system passes in
 * (typically a `RoslibRosbridgeTransport` instance with an injected
 * `setTopicType` shim), which keeps the architecture-boundary test
 * happy and the unit suite synchronous.
 */

export type RenderableChangeListener = (
  selections: RenderableTopicSelection[],
) => void

export interface RenderableSubscriber {
  /**
   * Register the ROS message type for `topic` so the underlying
   * transport can subscribe with the right wire-format tag.
   * Implementations that don't need a string type tag may treat this
   * as a no-op.
   */
  setTopicType(topic: string, messageType: string): void
  subscribe<T>(topic: string, handler: (message: T) => void): () => void
}

export interface RosbridgeRenderableTopicsOptions {
  /**
   * Override the whitelist used for support lookup. Tests pass a
   * shorter list; production wiring uses
   * {@link RENDERABLE_TOPIC_WHITELIST}.
   */
  whitelist?: ReadonlyArray<RenderableTopicSupport>
  /**
   * Map a `RenderableTopicSupport` row to the path-id used inside
   * `state.paths`. Defaults to the topic name (so a path published on
   * `/circle_path` is keyed as `'/circle_path'` in the registry).
   */
  pathIdFor?: (support: RenderableTopicSupport) => string
  /**
   * Callback fired whenever the set of selected topics changes. The
   * provider mirrors this into React state so the UI re-renders.
   */
  onChange?: RenderableChangeListener
}

interface InternalSelection {
  support: RenderableTopicSupport
  /** Cached ROS type at selection time (matches `support.messageType`). */
  topicType: string
  /** Path-id this selection writes into `state.paths`. */
  pathId: string
  unsubscribe?: () => void
}

export class RosbridgeRenderableTopics implements RenderableTopicCapability {
  private readonly subscriber: RenderableSubscriber
  private readonly queue: ExternalPathUpdateQueue
  private readonly whitelist: ReadonlyArray<RenderableTopicSupport>
  private readonly pathIdFor: (support: RenderableTopicSupport) => string
  private readonly internal = new Map<string, InternalSelection>()
  private cachedSnapshot: RenderableTopicSelection[] = []
  private onChange?: RenderableChangeListener

  constructor(
    subscriber: RenderableSubscriber,
    queue: ExternalPathUpdateQueue,
    options: RosbridgeRenderableTopicsOptions = {},
  ) {
    this.subscriber = subscriber
    this.queue = queue
    this.whitelist = options.whitelist ?? RENDERABLE_TOPIC_WHITELIST
    this.pathIdFor = options.pathIdFor ?? ((s) => s.topicName)
    this.onChange = options.onChange
  }

  /** Replace the change listener after construction (used by the provider). */
  setOnChange(listener: RenderableChangeListener | undefined): void {
    this.onChange = listener
  }

  /* -- RenderableTopicCapability -------------------------------------- */

  get selectedTopics(): RenderableTopicSelection[] {
    return this.cachedSnapshot
  }

  isRenderable(topic: TopicInfo): boolean {
    return findRenderableSupport(topic, this.whitelist) !== undefined
  }

  getUnsupportedReason(topic: TopicInfo): string | undefined {
    return this.isRenderable(topic) ? undefined : RENDER_UNSUPPORTED_REASON
  }

  isSelected(topicName: string): boolean {
    return this.internal.has(topicName)
  }

  selectTopic(topic: TopicInfo): void {
    const support = findRenderableSupport(topic, this.whitelist)
    if (!support) return
    if (this.internal.has(support.topicName)) return

    const pathId = this.pathIdFor(support)
    const selection: InternalSelection = {
      support,
      topicType: support.messageType,
      pathId,
    }

    try {
      this.subscriber.setTopicType(support.topicName, support.messageType)
      const handler = this.makeHandler(support, pathId)
      const off = this.subscriber.subscribe<unknown>(
        support.topicName,
        handler,
      )
      selection.unsubscribe = off
    } catch (err) {
      // Surface the failure by NOT registering the selection so the UI
      // checkbox falls back to unchecked. The thrown error propagates
      // to the caller (typically a button onClick) which already logs
      // through the React error boundary.
      throw err instanceof Error ? err : new Error(String(err))
    }

    this.internal.set(support.topicName, selection)
    this.emit()
  }

  deselectTopic(topicName: string): void {
    const selection = this.internal.get(topicName)
    if (!selection) return
    this.disposeSubscription(selection)
    this.internal.delete(topicName)
    // Tell the simulation system to drop the path on the next tick so
    // the viewport visibly loses the line. We never call
    // `state.paths.remove(...)` here — that would mutate state from a
    // non-tick context.
    this.queue.enqueueRemove(selection.pathId)
    this.emit()
  }

  /**
   * Tear down every active selection. Used by the provider on
   * transport teardown so we don't leak callbacks against a closed
   * socket or leave stale paths in `state.paths` after a disconnect.
   */
  closeAll(): void {
    if (this.internal.size === 0) return
    for (const selection of this.internal.values()) {
      this.disposeSubscription(selection)
      this.queue.enqueueRemove(selection.pathId)
    }
    this.internal.clear()
    this.emit()
  }

  /* -- internals ----------------------------------------------------- */

  private makeHandler(
    support: RenderableTopicSupport,
    pathId: string,
  ): (message: unknown) => void {
    if (support.kind === 'path2d') {
      const adapter = new RosPathToPath2DAdapter({
        pathId,
        pathName: support.topicName,
      })
      return (message: unknown) => {
        let path: Path2D
        try {
          path = adapter.toInternal(message)
        } catch (err) {
          // A single malformed frame must not poison the subscription.
          // We swallow with a console warn — the architecture rule
          // forbids us from mutating state from this callback, and
          // we don't have a logger handle here.
          console.warn(
            `[RosbridgeRenderableTopics] dropping malformed Path on "${support.topicName}":`,
            err,
          )
          return
        }
        this.queue.enqueueUpsert(path)
      }
    }
    // Defensive: we currently only model 'path2d'. Kept as a runtime
    // throw so adding a new kind without a handler fails loudly during
    // development rather than silently dropping frames.
    throw new Error(
      `RosbridgeRenderableTopics: unsupported kind "${support.kind}"`,
    )
  }

  private disposeSubscription(selection: InternalSelection): void {
    if (!selection.unsubscribe) return
    try {
      selection.unsubscribe()
    } catch {
      /* swallow — teardown must always succeed from caller's POV */
    }
    selection.unsubscribe = undefined
  }

  private emit(): void {
    this.cachedSnapshot = Array.from(this.internal.values()).map((s) => ({
      topicName: s.support.topicName,
      messageType: s.support.messageType,
      kind: s.support.kind,
    }))
    this.onChange?.(this.cachedSnapshot)
  }
}
