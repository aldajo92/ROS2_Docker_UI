import type {
  PathVisualConfig,
  RenderableTopicCapability,
  RenderableTopicSelection,
  RenderableTopicSupport,
} from '../../../app/RenderableTopics'
import {
  DEFAULT_PATH_VISUAL_CONFIG,
  RENDERABLE_TOPIC_WHITELIST,
  RENDER_UNSUPPORTED_REASON,
  findRenderableSupport,
} from '../../../app/RenderableTopics'
import type { TopicInfo } from '../../../app/TopicDiscovery'
import type {
  DisplayPlugin,
  DisplayRuntimeContext,
  DisplayVisualConfig,
} from '../../../app/display/DisplayPlugin'
import {
  DisplayPluginRegistry,
  defaultDisplayPluginRegistry,
} from '../../../app/display/DisplayPluginRegistry'
import { dlog, dwarn, throttledLog } from '../../../debug/RenderDebug'
import type { ExternalPathUpdateQueue } from '../../../simulation/paths/ExternalPathUpdateQueue'
import { ExternalPoseArrayUpdateQueue } from '../../../simulation/poses/ExternalPoseArrayUpdateQueue'
import type { Path2D } from '../../../simulation/paths/Path2D'
import type { RosTopicDisplayBinding } from './display/RosTopicDisplayBinding'
import {
  ROS_TOPIC_DISPLAY_BINDINGS,
  findRosTopicDisplayBinding,
} from './display/RosTopicDisplayBindings'

/**
 * Rosbridge-flavoured implementation of the generic
 * {@link RenderableTopicCapability}. Owns one rosbridge subscription
 * per selected topic, and pushes mutations into a simulation-side
 * `ExternalPathUpdateQueue` (drained by `ExternalPathRenderSystem`
 * during the next tick) instead of touching `SimulationState`
 * directly.
 *
 * Message-specific behaviour (adapter creation, artifact lifecycle) is
 * delegated to a {@link RosTopicDisplayBinding} + {@link DisplayPlugin}
 * pair looked up at selection time. Adding support for a new ROS message
 * type only requires:
 *   1. A new RosTopicDisplayBinding entry in RosTopicDisplayBindings.ts.
 *   2. A new DisplayPlugin registered in DisplayPluginRegistry.
 *   3. A whitelist entry in RenderableTopics.ts.
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
  /**
   * Override the display-plugin registry. Tests may supply a trimmed
   * registry; production wiring uses {@link defaultDisplayPluginRegistry}.
   */
  displayPluginRegistry?: DisplayPluginRegistry
  /**
   * Override the ROS topic → display-plugin bindings. Tests may supply
   * a custom list; production wiring uses {@link ROS_TOPIC_DISPLAY_BINDINGS}.
   */
  bindings?: ReadonlyArray<RosTopicDisplayBinding<unknown>>
  /**
   * Queue for pose-array mutations. Required for pose_array_2d topics.
   * If omitted, pose-array topics will fail at selection time.
   */
  poseArrayQueue?: ExternalPoseArrayUpdateQueue
}

interface InternalSelection {
  topicName: string
  support: RenderableTopicSupport
  /** Cached ROS type at selection time (matches `support.messageType`). */
  topicType: string
  /** Artifact-id this selection writes into the simulation registry. */
  pathId: string
  unsubscribe?: () => void
  visualConfig: PathVisualConfig
  /** Resolved plugin for this selection — used by setVisualConfig / deselect. */
  plugin: DisplayPlugin<unknown, DisplayVisualConfig>
  /** Most-recent artifact produced by the handler, cached so that
   *  `setVisualConfig` can re-enqueue it with updated visual config
   *  for immediate visual feedback without waiting for the next ROS message. */
  lastArtifact: unknown
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
  private readonly context: DisplayRuntimeContext
  private readonly whitelist: ReadonlyArray<RenderableTopicSupport>
  private readonly pathIdFor: (
    topic: TopicInfo,
    support: RenderableTopicSupport,
  ) => string
  private readonly pluginRegistry: DisplayPluginRegistry
  private readonly bindings: ReadonlyArray<RosTopicDisplayBinding<unknown>>
  private readonly internal = new Map<string, InternalSelection>()
  /**
   * Last-known per-topic visual config, kept across `deselectTopic` so
   * that a deselect → re-select cycle restores the user's color /
   * thickness instead of resetting to {@link DEFAULT_PATH_VISUAL_CONFIG}.
   * Cleared by {@link closeAll} (transport teardown) so we don't leak
   * preferences across separate connections / sessions.
   */
  private readonly rememberedVisualConfig = new Map<string, PathVisualConfig>()
  private cachedSnapshot: RenderableTopicSelection[] = []
  private onChange?: RenderableChangeListener

  constructor(
    subscriber: RenderableSubscriber,
    queue: ExternalPathUpdateQueue,
    options: RosbridgeRenderableTopicsOptions = {},
  ) {
    this.subscriber = subscriber
    this.context = {
      pathQueue: queue,
      // Fall back to a disconnected queue so tests that don't care about
      // pose arrays don't need to supply one. Updates accumulate until GC.
      poseArrayQueue: options.poseArrayQueue ?? new ExternalPoseArrayUpdateQueue(),
    }
    this.whitelist = options.whitelist ?? RENDERABLE_TOPIC_WHITELIST
    this.pathIdFor = options.pathIdFor ?? ((topic) => topic.name)
    this.onChange = options.onChange
    this.pluginRegistry =
      options.displayPluginRegistry ?? defaultDisplayPluginRegistry
    this.bindings = options.bindings ?? ROS_TOPIC_DISPLAY_BINDINGS
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

    // Resolve the binding + plugin pair for this message type.
    const binding = findRosTopicDisplayBinding(support.messageType, this.bindings)
    if (!binding) {
      throw new Error(
        `RosbridgeRenderableTopics: no binding registered for message type "${support.messageType}"`,
      )
    }
    const plugin = this.pluginRegistry.get(binding.displayPluginId)
    if (!plugin) {
      throw new Error(
        `RosbridgeRenderableTopics: no plugin registered for id "${binding.displayPluginId}"`,
      )
    }

    const pathId = this.pathIdFor(topic, support)
    const remembered = this.rememberedVisualConfig.get(topic.name)
    const selection: InternalSelection = {
      topicName: topic.name,
      support,
      topicType: support.messageType,
      pathId,
      // Restore the user's last visual config for this topic if we
      // saw it earlier in this session; fall back to the plugin's own
      // default so each plugin type starts with its intended colors/sizes.
      visualConfig: remembered
        ? { ...remembered }
        : pluginDefaultToVisualConfig(plugin.defaultConfig as Record<string, unknown>),
      plugin,
      lastArtifact: null,
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
      const handler = this.makeHandler(topic.name, pathId, selection, binding)
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
    // Tell the simulation system to drop the artifact on the next tick
    // so the viewport visibly loses the line.
    selection.plugin.enqueueRemove(selection.pathId, this.context)
    dlog(
      'TopicData',
      `unsubscribe topic="${topicName}" stats=`,
      selection.stats,
    )
    this.emit()
  }

  getVisualConfig(topicName: string): PathVisualConfig {
    const selection = this.internal.get(topicName)
    if (selection) return { ...selection.visualConfig }
    const remembered = this.rememberedVisualConfig.get(topicName)
    return remembered
      ? { ...remembered }
      : { ...DEFAULT_PATH_VISUAL_CONFIG }
  }

  setVisualConfig(topicName: string, config: Partial<PathVisualConfig>): void {
    const selection = this.internal.get(topicName)
    if (!selection) return
    selection.visualConfig = { ...selection.visualConfig, ...config }
    this.rememberedVisualConfig.set(topicName, { ...selection.visualConfig })
    if (selection.lastArtifact !== null) {
      const configured = selection.plugin.applyConfig(
        selection.lastArtifact,
        selection.visualConfig as DisplayVisualConfig,
      )
      selection.lastArtifact = configured
      selection.plugin.enqueueUpsert(configured, this.context)
    }
    this.emit()
  }

  /**
   * Tear down every active selection. Used by the provider on
   * transport teardown so we don't leak callbacks against a closed
   * socket or leave stale artifacts in state after a disconnect.
   */
  closeAll(): void {
    if (this.internal.size === 0 && this.rememberedVisualConfig.size === 0) {
      return
    }
    dlog('TopicData', `closeAll selections=${this.internal.size}`)
    for (const selection of this.internal.values()) {
      this.disposeSubscription(selection)
      selection.plugin.enqueueRemove(selection.pathId, this.context)
    }
    this.internal.clear()
    // Drop remembered visual configs on transport teardown so they
    // don't bleed into the next connection / session.
    this.rememberedVisualConfig.clear()
    this.emit()
  }

  /* -- internals ----------------------------------------------------- */

  private makeHandler(
    topicName: string,
    pathId: string,
    selection: InternalSelection,
    binding: RosTopicDisplayBinding<unknown>,
  ): (message: unknown) => void {
    const adapter = binding.createAdapter({
      artifactId: pathId,
      artifactName: topicName,
    })

    return (message: unknown) => {
      const stats = selection.stats
      stats.received += 1

      let artifact: unknown
      try {
        artifact = adapter.toInternal(message)
      } catch (err) {
        stats.dropped += 1
        // A single malformed frame must not poison the subscription.
        console.warn(
          `[TopicData] dropping malformed message on "${topicName}":`,
          err,
        )
        dwarn(
          'TopicData',
          `malformed topic="${topicName}" droppedTotal=${stats.dropped} receivedTotal=${stats.received}`,
        )
        return
      }

      // Path-specific diagnostic logging (cast is safe: path2d is the
      // only binding today; generalise when new artifact types arrive).
      const path = artifact as Path2D
      const pointCount = path.points?.length ?? 0
      const isEmpty = pointCount === 0
      if (isEmpty) stats.empty += 1

      const fingerprint = pathFingerprint(path)
      const isUnchanged =
        stats.lastFingerprint !== null &&
        stats.lastFingerprint === fingerprint
      if (isUnchanged) stats.unchanged += 1
      stats.lastFingerprint = fingerprint

      if (!stats.loggedFirst) {
        stats.loggedFirst = true
        dlog(
          'TopicData',
          `firstMessage topic="${topicName}" points=${pointCount}` +
            ` frameId="${path.frameId ?? ''}"` +
            ` stamp=${extractStamp(message) ?? 'n/a'}`,
        )
      }

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

      const configured = selection.plugin.applyConfig(
        artifact,
        selection.visualConfig as DisplayVisualConfig,
      )
      selection.lastArtifact = configured
      selection.plugin.enqueueUpsert(configured, this.context)
    }
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
      visualConfig: { ...s.visualConfig },
    }))
    this.onChange?.(this.cachedSnapshot)
  }
}

/**
 * Build a `PathVisualConfig` from a plugin's `defaultConfig`. Spreads all
 * known fields so plugin-specific extras (e.g. `arrowSize`) are preserved
 * without `RosbridgeRenderableTopics` needing to know about each plugin's
 * concrete config type.
 */
function pluginDefaultToVisualConfig(
  defaultConfig: Record<string, unknown>,
): PathVisualConfig {
  return {
    color: (typeof defaultConfig.color === 'string'
      ? defaultConfig.color
      : DEFAULT_PATH_VISUAL_CONFIG.color) as string,
    thickness: (typeof defaultConfig.thickness === 'number'
      ? defaultConfig.thickness
      : DEFAULT_PATH_VISUAL_CONFIG.thickness) as number,
    ...(typeof defaultConfig.arrowSize === 'number'
      ? { arrowSize: defaultConfig.arrowSize }
      : {}),
  }
}

/**
 * Cheap "did this frame change?" fingerprint. Avoids touching every
 * point — we only sample first/last + count, which is enough to
 * distinguish the resampled paths the simulator actually cares about.
 */
function pathFingerprint(path: Path2D): string {
  const n = path.points?.length ?? 0
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
