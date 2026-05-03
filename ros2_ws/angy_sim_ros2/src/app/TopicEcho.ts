import type { TopicInfo } from './TopicDiscovery'

/**
 * Generic UI-facing capability for live ROS topic echo. The simulation
 * core never needs this: echo is an inspector feature for operators
 * who want to look at messages flowing on the bus. Implementations
 * live under `src/infrastructure/communication/<vendor>/`; today only
 * `rosbridge/` provides one.
 *
 * Lifecycle invariants:
 *   - Sessions are scoped to the active transport. Switching transport
 *     (or disconnecting) clears every session — there's no point
 *     keeping a card pinned to a connection that no longer exists.
 *   - The capability is exposed through `CommunicationContext` and is
 *     `undefined` whenever the active transport doesn't support echo
 *     (today: anything other than a connected rosbridge).
 *   - `startEcho` on a topic that already has a session is idempotent:
 *     a stopped session resumes; a listening one is a no-op.
 */

export type TopicEchoStatus = 'listening' | 'stopped' | 'error'

export interface TopicEchoSession {
  /** Fully-qualified topic name including leading slash. */
  topicName: string
  /**
   * ROS 2 message type if known (e.g. `std_msgs/msg/Int32`). The UI
   * shows it as metadata; the implementation needs it to build a
   * subscription against typed transports like rosbridge.
   */
  topicType?: string
  status: TopicEchoStatus
  /**
   * Most recent payload received on the topic. `undefined` until the
   * first message arrives. Opaque on purpose — the UI just renders it
   * as JSON; the simulator doesn't care about the shape.
   */
  latestMessage?: unknown
  /**
   * Number of messages received over the lifetime of this session
   * (including resumes). Useful for the UI to label "received N
   * messages" without keeping its own counter.
   */
  messageCount: number
  /** Wall-clock ms when the latest message arrived; undefined until then. */
  lastReceivedAt?: number
  /** Defined only when `status === 'error'`. */
  error?: string
}

export interface TopicEchoCapability {
  /**
   * Snapshot of currently-tracked sessions. UI renders one card per
   * entry; ordering should be stable from the implementation's POV
   * (today: insertion order).
   */
  sessions: TopicEchoSession[]
  /**
   * Begin (or resume) echoing `topic`. Safe to call repeatedly with
   * the same topic — duplicates are coalesced into a single session.
   */
  startEcho: (topic: TopicInfo) => void
  /**
   * Stop receiving new messages but keep the session card visible
   * with the last payload frozen. The session can be resumed with
   * another `startEcho` call.
   */
  stopEcho: (topicName: string) => void
  /**
   * Stop the session if active and remove the card entirely. After
   * this returns, `sessions` no longer contains an entry for
   * `topicName`.
   */
  closeEcho: (topicName: string) => void
}

/* -- helpers ------------------------------------------------------------ */

/**
 * Pretty-print an arbitrary message payload for display in the echo
 * card. Centralised so test code and the UI agree on formatting,
 * including handling of values that don't survive `JSON.stringify`
 * (BigInt, circular refs, …) without crashing the React tree.
 */
export function formatEchoMessage(message: unknown): string {
  if (message === undefined) return ''
  try {
    return JSON.stringify(message, replacer, 2)
  } catch {
    return String(message)
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Uint8Array) return Array.from(value)
  return value
}
