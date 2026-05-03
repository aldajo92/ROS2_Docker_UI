import type {
  TopicEchoCapability,
  TopicEchoSession,
} from '../../../app/TopicEcho'
import type { TopicInfo } from '../../../app/TopicDiscovery'

/**
 * Rosbridge-flavoured implementation of the generic
 * {@link TopicEchoCapability}. Owns one subscription per active
 * topic; pushes a refreshed `TopicEchoSession[]` snapshot through the
 * `onChange` callback every time something interesting happens (new
 * session, new message, status flip, …).
 *
 * This file deliberately does NOT import `roslib`. It works against a
 * tiny `EchoTransport` adapter — `setTopicType` + the standard
 * `Transport.subscribe` — which the wider system can satisfy with a
 * `RoslibRosbridgeTransport` instance (production), or a fake
 * (tests).
 */

export interface EchoTransport {
  /**
   * Register the ROS message type for `topic`. Implementations that
   * don't need a string type tag may treat this as a no-op.
   */
  setTopicType(topic: string, messageType: string): void
  subscribe<T>(topic: string, handler: (message: T) => void): () => void
}

export type EchoChangeListener = (sessions: TopicEchoSession[]) => void

interface InternalSession {
  topicName: string
  topicType?: string
  status: TopicEchoSession['status']
  latestMessage?: unknown
  messageCount: number
  lastReceivedAt?: number
  error?: string
  unsubscribe?: () => void
}

export class RosbridgeTopicEcho implements TopicEchoCapability {
  private readonly internal = new Map<string, InternalSession>()
  private cachedSnapshot: TopicEchoSession[] = []

  constructor(
    private readonly transport: EchoTransport,
    private readonly onChange: EchoChangeListener,
  ) {}

  get sessions(): TopicEchoSession[] {
    return this.cachedSnapshot
  }

  /* -- TopicEchoCapability ------------------------------------------- */

  startEcho(topic: TopicInfo): void {
    if (typeof topic?.name !== 'string' || topic.name.length === 0) return

    let session = this.internal.get(topic.name)
    if (session) {
      // Refresh metadata in case discovery learned a type we didn't
      // have on first start.
      if (topic.type && !session.topicType) {
        session.topicType = topic.type
      }
      if (session.status === 'listening') {
        // Already streaming — nothing to do, but still emit a fresh
        // snapshot so callers can rely on `startEcho` being a stable
        // "set this session to listening" intent.
        this.emit()
        return
      }
      // Resume from stopped/error.
      this.subscribeFor(session)
      this.emit()
      return
    }

    session = {
      topicName: topic.name,
      topicType: topic.type,
      status: 'listening',
      messageCount: 0,
    }
    this.internal.set(topic.name, session)
    this.subscribeFor(session)
    this.emit()
  }

  stopEcho(topicName: string): void {
    const session = this.internal.get(topicName)
    if (!session) return
    this.disposeSubscription(session)
    if (session.status !== 'error') {
      session.status = 'stopped'
    }
    this.emit()
  }

  closeEcho(topicName: string): void {
    const session = this.internal.get(topicName)
    if (!session) return
    this.disposeSubscription(session)
    this.internal.delete(topicName)
    this.emit()
  }

  /**
   * Tear down every active session. The provider calls this on
   * transport teardown (kind change / disconnect / unmount) so we
   * don't leak callbacks against a closed socket.
   */
  closeAll(): void {
    if (this.internal.size === 0) return
    for (const session of this.internal.values()) {
      this.disposeSubscription(session)
    }
    this.internal.clear()
    this.emit()
  }

  /* -- internals ----------------------------------------------------- */

  private subscribeFor(session: InternalSession): void {
    // Make sure roslib has the type tag before we ask it to subscribe;
    // missing type causes the underlying transport to throw, which we
    // surface as an `error` session rather than letting the exception
    // escape the UI's onClick handler.
    try {
      if (session.topicType) {
        this.transport.setTopicType(session.topicName, session.topicType)
      }
      const off = this.transport.subscribe(
        session.topicName,
        (message: unknown) => {
          session.latestMessage = message
          session.messageCount += 1
          session.lastReceivedAt = Date.now()
          // Defensive: a late frame arriving after stopEcho() is
          // ignored at the unsubscribe level, but we still guard here
          // so a buggy fake transport can't promote a stopped session.
          if (session.status !== 'listening') return
          this.emit()
        },
      )
      session.unsubscribe = off
      session.status = 'listening'
      session.error = undefined
    } catch (err) {
      session.unsubscribe = undefined
      session.status = 'error'
      session.error = err instanceof Error ? err.message : String(err)
    }
  }

  private disposeSubscription(session: InternalSession): void {
    if (!session.unsubscribe) return
    try {
      session.unsubscribe()
    } catch {
      /* swallow — teardown must always succeed from caller's POV */
    }
    session.unsubscribe = undefined
  }

  private emit(): void {
    this.cachedSnapshot = Array.from(this.internal.values()).map(toSnapshot)
    this.onChange(this.cachedSnapshot)
  }
}

function toSnapshot(s: InternalSession): TopicEchoSession {
  return {
    topicName: s.topicName,
    topicType: s.topicType,
    status: s.status,
    latestMessage: s.latestMessage,
    messageCount: s.messageCount,
    lastReceivedAt: s.lastReceivedAt,
    error: s.error,
  }
}
