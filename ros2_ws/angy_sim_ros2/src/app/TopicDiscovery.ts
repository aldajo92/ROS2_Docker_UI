/**
 * Generic UI-facing capability for discovering ROS topics on the
 * active transport.
 *
 * The simulation core is transport-agnostic: it never asks "what
 * topics exist on the network?" because the engine doesn't care. The
 * inspector UI does — operators want to confirm the bridge is alive
 * and see what's flowing. This module is the contract that lets the
 * UI ask that question without knowing whether it'll be answered by
 * rosbridge / DDS / MQTT / a fake.
 *
 * Implementations live under `src/infrastructure/communication/<vendor>/`
 * (currently only `rosbridge/`). The `CommunicationProvider` wires the
 * concrete implementation when the active transport is one that
 * supports topic listing, and exposes the capability state to the UI
 * via `CommunicationContext`.
 */

export interface TopicInfo {
  /** Fully-qualified topic name including leading slash, e.g. `/demo/counter`. */
  name: string
  /**
   * ROS 2 message type, e.g. `std_msgs/msg/Int32`. Optional because not
   * every transport can resolve types (e.g. a transport that only
   * lists topic names without metadata).
   */
  type?: string
}

export interface TopicDiscovery {
  /**
   * One-shot listing of topics on the network. Implementations should
   * de-duplicate and return a stable order (alphabetical by name is a
   * sensible default).
   *
   * Resolves with the snapshot. Rejects on transport errors so the
   * caller can surface a UI error message.
   */
  refreshTopics(): Promise<TopicInfo[]>
}

/**
 * UI-facing finite-state machine for the discovery capability:
 *
 *   - `idle`    — capability is wired but no refresh has run yet.
 *   - `loading` — refresh is in flight (covers manual + auto-load).
 *   - `ready`   — last refresh completed; `topics` and `lastUpdated`
 *                 reflect that snapshot.
 *   - `error`   — last refresh rejected; `error` describes why.
 *                 Previous `topics` snapshot (if any) is kept so the
 *                 UI can keep showing stale data with an error banner.
 */
export type TopicDiscoveryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TopicDiscoveryState {
  status: TopicDiscoveryStatus
  topics: TopicInfo[]
  /** Last successful refresh, epoch ms. Undefined until `ready` is reached. */
  lastUpdated?: number
  /** Defined only when `status === 'error'`. */
  error?: string
  /**
   * Trigger a manual refresh. Safe to call any time; concurrent calls
   * while a refresh is in flight are coalesced (the second call is a
   * no-op until the first finishes).
   */
  refresh: () => void
}

/* -- system-topic filter (UI policy) ------------------------------------ */
//
// "System topics" are the rosgraph/rosapi plumbing topics that exist
// on every ROS 2 graph; they're rarely interesting when the operator
// is debugging the application. The filter is intentionally a pure
// policy decision in the UI layer — discovery returns *every* topic
// from the network, and the UI decides what to hide.

const SYSTEM_TOPIC_LITERALS: ReadonlySet<string> = new Set([
  '/rosout',
  '/parameter_events',
  '/client_count',
  '/connected_clients',
])

const ROSAPI_TOPIC_PATTERN = /^\/rosapi(\/.*)?$/

/**
 * `true` when `topicName` is a well-known system / rosgraph plumbing
 * topic (`/rosout`, `/parameter_events`, `/client_count`,
 * `/connected_clients`, or anything under `/rosapi/`).
 */
export function isSystemTopic(topicName: string): boolean {
  if (SYSTEM_TOPIC_LITERALS.has(topicName)) return true
  if (ROSAPI_TOPIC_PATTERN.test(topicName)) return true
  return false
}
