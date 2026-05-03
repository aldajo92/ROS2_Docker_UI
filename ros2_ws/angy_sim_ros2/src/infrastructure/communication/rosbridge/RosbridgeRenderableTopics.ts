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
import { dlog, dwarn, throttledLog } from '../../../debug/RenderDebug'
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
   * Map a discovered topic to the path-id used inside `state.paths`.
   * Defaults to the discovered topic name.
   */
  pathIdFor?: (topic: TopicInfo, support: RenderableTopicSupport) => string
  /**
   * Callback fired whenever the set of selected topics changes. The
   * provider mirrors this into React state so the UI re-renders.
   */
  onChange?: RenderableChangeListener
}

interface InternalSelection {
  topicName: string
  support: RenderableTopicSupport
  /** Cached ROS type at selection time (matches `support.messageType`). */
  topicType: string
  /** Path-id this selection writes into `state.paths`. */
  pathId: string
  unsubscribe?: () => void
  /** Diagnostic counters — never feed back into rendering decisions. */
  stats: {
    received: number
    dropped: number
    empty: number
    unchanged: number
    /** Cheap fingerprint of the previous frame (pointCount + first/last). */
    lastFingerprint: string | null
    /** First-frame log already emitted? (one-shot per subscription) */
    loggedFirst: boolean
  }
}

export class RosbridgeRenderableTopics implements RenderableTopicCapability {
  private readonly subscriber: RenderableSubscriber
  private readonly queue: ExternalPathUpdateQueue
  private readonly whitelist: ReadonlyArray<RenderableTopicSupport>
  private readonly pathIdFor: (
    topic: TopicInfo,
    support: RenderableTopicSupport,
  ) => string
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
    this.pathIdFor = options.pathIdFor ?? ((topic) => topic.name)
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
    if (this.internal.has(topic.name)) return

    const pathId = this.pathIdFor(topic, support)
    const selection: InternalSelection = {
      topicName: topic.name,
      support,
      topicType: support.messageType,
      pathId,
      stats: {
        received: 0,
        dropped: 0,
        empty: 0,
        unchanged: 0,
        lastFingerprint: null,
        loggedFirst: false,
      },
    }

    try {
      this.subscriber.setTopicType(topic.name, support.messageType)
      const handler = this.makeHandler(topic.name, support, pathId, selection)
      const off = this.subscriber.subscribe<unknown>(topic.name, handler)
      selection.unsubscribe = off
      dlog(
        'TopicData',
        `subscribe topic="${topic.name}" type="${support.messageType}" pathId="${pathId}"`,
      )
    } catch (err) {
      // Surface the failure by NOT registering the selection so the UI
      // checkbox falls back to unchecked. The thrown error propagates
      // to the caller (typically a button onClick) which already logs
      // through the React error boundary.
      throw err instanceof Error ? err : new Error(String(err))
    }

    this.internal.set(topic.name, selection)
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
    dlog(
      'TopicData',
      `unsubscribe topic="${topicName}" stats=`,
      selection.stats,
    )
    this.emit()
  }

  /**
   * Tear down every active selection. Used by the provider on
   * transport teardown so we don't leak callbacks against a closed
   * socket or leave stale paths in `state.paths` after a disconnect.
   */
  closeAll(): void {
    if (this.internal.size === 0) return
    dlog('TopicData', `closeAll selections=${this.internal.size}`)
    for (const selection of this.internal.values()) {
      this.disposeSubscription(selection)
      this.queue.enqueueRemove(selection.pathId)
    }
    this.internal.clear()
    this.emit()
  }

  /* -- internals ----------------------------------------------------- */

  private makeHandler(
    topicName: string,
    support: RenderableTopicSupport,
    pathId: string,
    selection: InternalSelection,
  ): (message: unknown) => void {
    if (support.kind === 'path2d') {
      const adapter = new RosPathToPath2DAdapter({
        pathId,
        pathName: topicName,
      })
      return (message: unknown) => {
        const stats = selection.stats
        stats.received += 1

        let path: Path2D
        try {
          path = adapter.toInternal(message)
        } catch (err) {
          stats.dropped += 1
          // A single malformed frame must not poison the subscription.
          // We swallow with a console warn — the architecture rule
          // forbids us from mutating state from this callback.
          console.warn(
            `[TopicData] dropping malformed Path on "${topicName}":`,
            err,
          )
          dwarn(
            'TopicData',
            `malformed topic="${topicName}" droppedTotal=${stats.dropped} receivedTotal=${stats.received}`,
          )
          return
        }

        const pointCount = path.points.length
        const isEmpty = pointCount === 0
        if (isEmpty) stats.empty += 1

        const fingerprint = pathFingerprint(path)
        const isUnchanged =
          stats.lastFingerprint !== null &&
          stats.lastFingerprint === fingerprint
        if (isUnchanged) stats.unchanged += 1
        stats.lastFingerprint = fingerprint

        // One-shot log on the very first message of this subscription
        // so we can confirm the wire is live even without throttling.
        if (!stats.loggedFirst) {
          stats.loggedFirst = true
          dlog(
            'TopicData',
            `firstMessage topic="${topicName}" points=${pointCount}` +
              ` frameId="${path.frameId ?? ''}"` +
              ` stamp=${extractStamp(message) ?? 'n/a'}`,
          )
        }

        // Periodic summary so high-rate publishers don't flood the
        // console. Includes growth/empty/unchanged counters that make
        // backpressure and dropped-frame issues visible.
        throttledLog('TopicData', `recv:${topicName}`, () => [
          `topic="${topicName}"`,
          `points=${pointCount}`,
          `received=${stats.received}`,
          `dropped=${stats.dropped}`,
          `empty=${stats.empty}`,
          `unchanged=${stats.unchanged}`,
          `frameId="${path.frameId ?? ''}"`,
          `stamp=${extractStamp(message) ?? 'n/a'}`,
        ])

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
      topicName: s.topicName,
      messageType: s.support.messageType,
      kind: s.support.kind,
    }))
    this.onChange?.(this.cachedSnapshot)
  }
}

/**
 * Cheap "did this frame change?" fingerprint. Avoids touching every
 * point — we only sample first/last + count, which is enough to
 * distinguish the resampled paths the simulator actually cares about.
 */
function pathFingerprint(path: Path2D): string {
  const n = path.points.length
  if (n === 0) return '0:'
  const first = path.points[0]
  const last = path.points[n - 1]
  return `${n}:${first.x.toFixed(3)},${first.y.toFixed(3)};${last.x.toFixed(3)},${last.y.toFixed(3)}`
}

/**
 * Best-effort `header.stamp` extractor from a wire-format ROS message.
 * Returns `undefined` when the field is missing or shaped unexpectedly,
 * so logging never fails on malformed payloads.
 */
function extractStamp(message: unknown): string | undefined {
  const m = message as
    | { header?: { stamp?: { sec?: number; nanosec?: number } } }
    | undefined
  const stamp = m?.header?.stamp
  if (!stamp) return undefined
  const sec = typeof stamp.sec === 'number' ? stamp.sec : undefined
  const nanosec = typeof stamp.nanosec === 'number' ? stamp.nanosec : undefined
  if (sec === undefined && nanosec === undefined) return undefined
  return `${sec ?? '?'}.${(nanosec ?? 0).toString().padStart(9, '0')}`
}
