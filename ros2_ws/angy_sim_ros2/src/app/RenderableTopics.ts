import type { TopicInfo } from './TopicDiscovery'

/**
 * Generic UI-facing capability for selecting which discovered ROS
 * topics should be *rendered* in the active viewport (Three / Phaser /
 * future).
 *
 * The simulation core never asks "render this topic": rendering is a
 * UI concern, and the renderer itself is renderer-agnostic — it reads
 * `state.paths` and friends, not topics. This module is the contract
 * that lets the inspector UI flip a per-topic toggle without knowing
 * whether the toggle is backed by rosbridge / DDS / MQTT / a fake.
 *
 * Architectural rules enforced by this file:
 *   - This module only depends on `TopicInfo` (a generic shape from
 *     the topic-discovery layer). It does NOT import `roslib`, ROS
 *     message schemas, or any infrastructure transport.
 *   - The whitelist constant lives here as plain data so the UI and
 *     concrete capability implementations can share it without
 *     reaching into rosbridge code.
 *   - Implementations live under `src/infrastructure/communication/<vendor>/`
 *     and are wired through `CommunicationContext`.
 */

/**
 * What kind of simulator artifact a renderable topic resolves to.
 * `path2d` means the topic produces a `Path2D` that lands in
 * `state.paths` and is rendered by the existing Three / Phaser
 * `*PathRenderer`s.
 *
 * Adding new kinds (e.g. `pose2d`, `pointcloud2d`) only needs:
 *   - a new entry here,
 *   - a new whitelist row,
 *   - a new wire-format → simulator adapter under the appropriate
 *     infrastructure folder,
 *   - and a tiny piece of routing inside the implementation. UI code
 *     does not need to fan out per kind because the panel only renders
 *     the generic checkbox.
 */
/** Per-topic visual configuration set by the user in the Inspector. */
export interface PathVisualConfig {
  /** CSS hex color, e.g. '#f0c14a'. */
  color: string
  /** Line thickness (renderer-specific units, default ~2). */
  thickness: number
}

export const DEFAULT_PATH_VISUAL_CONFIG: PathVisualConfig = {
  color: '#f0c14a',
  thickness: 2,
}

export type RenderableTopicKind = 'path2d'

/**
 * Static description of one supported message type.
 * The whitelist matches message type only, so any discovered topic
 * with the same wire type is renderable.
 */
export interface RenderableTopicSupport {
  /** ROS 2 message type, e.g. `nav_msgs/msg/Path`. */
  messageType: string
  kind: RenderableTopicKind
}

/**
 * Snapshot of one selected renderable topic. Mirrors the structure
 * used by `TopicEchoSession` so consumers can iterate over both
 * collections similarly.
 */
export interface RenderableTopicSelection {
  topicName: string
  messageType: string
  kind: RenderableTopicKind
  visualConfig: PathVisualConfig
}

/**
 * Capability surface consumed by `Ros2TopicsPanel` (and any future
 * UI). Implementations:
 *
 *   - keep their own subscription bookkeeping,
 *   - never mutate `SimulationState` directly (they push into a
 *     simulation-side queue that is drained by a `SimulationSystem`
 *     during the tick),
 *   - clean up on transport teardown / disconnect.
 */
export interface RenderableTopicCapability {
  /**
   * `true` when `topic.type` is whitelisted as a renderable kind.
   * The UI uses this to gate the checkbox.
   */
  isRenderable(topic: TopicInfo): boolean
  /**
   * Reason a row is not renderable, for use as the tooltip on a
   * disabled checkbox. `undefined` when the topic *is* renderable.
   */
  getUnsupportedReason(topic: TopicInfo): string | undefined
  /** `true` when there is an active selection for the topic. */
  isSelected(topicName: string): boolean
  /**
   * Begin rendering the topic. No-op when the topic is already
   * selected or not whitelisted.
   */
  selectTopic(topic: TopicInfo): void
  /**
   * Stop rendering the topic. Idempotent — calling on an unselected
   * topic is a no-op. Implementations must also remove the rendered
   * artifact (e.g. its `state.paths` entry) so the viewport visibly
   * loses the path.
   */
  deselectTopic(topicName: string): void
  /** Snapshot of currently-selected topics. Insertion order is stable. */
  selectedTopics: RenderableTopicSelection[]
  /** Get the current visual config for a selected topic. Returns the default if not customized. */
  getVisualConfig(topicName: string): PathVisualConfig
  /** Update per-topic visual config. Only applies to selected topics. */
  setVisualConfig(topicName: string, config: Partial<PathVisualConfig>): void
}

/* -- Whitelist (UI policy) --------------------------------------------- */
//
// The single source of truth for "which topics can be rendered". Plain
// data so unit tests can inspect it and the rosbridge implementation
// can resolve a `TopicInfo` to a `RenderableTopicSupport` without any
// coupling to UI components.

export const RENDERABLE_TOPIC_WHITELIST: ReadonlyArray<RenderableTopicSupport> =
  Object.freeze([
    {
      messageType: 'nav_msgs/msg/Path',
      kind: 'path2d',
    },
  ])

/**
 * Reason text shown next to a disabled render checkbox. Constant here
 * so tests can assert on it without re-typing the string.
 */
export const RENDER_UNSUPPORTED_REASON =
  'Rendering for this topic is not supported yet.'

/**
 * Resolve a discovered topic to its whitelist entry, or `undefined` if
 * the topic isn't supported. Matching is type-based only.
 */
export function findRenderableSupport(
  topic: TopicInfo,
  whitelist: ReadonlyArray<RenderableTopicSupport> = RENDERABLE_TOPIC_WHITELIST,
): RenderableTopicSupport | undefined {
  if (!topic || typeof topic.type !== 'string') return undefined
  for (const entry of whitelist) {
    if (entry.messageType !== topic.type) continue
    return entry
  }
  return undefined
}
