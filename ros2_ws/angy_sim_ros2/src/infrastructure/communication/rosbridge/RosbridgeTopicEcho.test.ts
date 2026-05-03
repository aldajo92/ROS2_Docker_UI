import { describe, expect, it, vi } from 'vitest'
import {
  RosbridgeTopicEcho,
  type EchoTransport,
} from './RosbridgeTopicEcho'
import type { TopicEchoSession } from '../../../app/TopicEcho'

/**
 * In-memory `EchoTransport` double. Tracks `setTopicType` calls,
 * registers handlers per topic, and exposes a `pump(topic, message)`
 * helper so tests can deliver fake frames synchronously.
 */
class FakeTransport implements EchoTransport {
  topicTypes = new Map<string, string>()
  handlers = new Map<string, Set<(msg: unknown) => void>>()
  unsubscribeCalls: string[] = []
  /** Optional override — when set, `subscribe()` throws. */
  subscribeShouldThrow = false

  setTopicType(topic: string, messageType: string): void {
    this.topicTypes.set(topic, messageType)
  }

  subscribe<T>(topic: string, handler: (message: T) => void): () => void {
    if (this.subscribeShouldThrow) {
      throw new Error('subscribe failed')
    }
    let set = this.handlers.get(topic)
    if (!set) {
      set = new Set()
      this.handlers.set(topic, set)
    }
    set.add(handler as (msg: unknown) => void)
    return () => {
      this.unsubscribeCalls.push(topic)
      set?.delete(handler as (msg: unknown) => void)
    }
  }

  pump(topic: string, message: unknown): void {
    const set = this.handlers.get(topic)
    if (!set) throw new Error(`no subscribers for ${topic}`)
    for (const fn of [...set]) fn(message)
  }

  hasSubscribers(topic: string): boolean {
    const set = this.handlers.get(topic)
    return Boolean(set && set.size > 0)
  }
}

interface Rig {
  transport: FakeTransport
  echo: RosbridgeTopicEcho
  changes: TopicEchoSession[][]
}

function makeRig(): Rig {
  const transport = new FakeTransport()
  const changes: TopicEchoSession[][] = []
  const echo = new RosbridgeTopicEcho(transport, (snapshot) => {
    changes.push(snapshot)
  })
  return { transport, echo, changes }
}

describe('RosbridgeTopicEcho — basic lifecycle', () => {
  it('startEcho creates a listening session and registers the topic type', () => {
    const { transport, echo, changes } = makeRig()
    echo.startEcho({ name: '/demo/counter', type: 'std_msgs/msg/Int32' })

    expect(transport.topicTypes.get('/demo/counter')).toBe('std_msgs/msg/Int32')
    expect(transport.hasSubscribers('/demo/counter')).toBe(true)

    expect(echo.sessions).toHaveLength(1)
    const s = echo.sessions[0]
    expect(s.topicName).toBe('/demo/counter')
    expect(s.topicType).toBe('std_msgs/msg/Int32')
    expect(s.status).toBe('listening')
    expect(s.messageCount).toBe(0)
    expect(s.latestMessage).toBeUndefined()

    // The first emit lands in `changes` so consumers see the new session.
    expect(changes.at(-1)).toEqual(echo.sessions)
  })

  it('does not call setTopicType when topic.type is missing (transport falls back to its own map)', () => {
    const { transport, echo } = makeRig()
    echo.startEcho({ name: '/typeless' })
    expect(transport.topicTypes.has('/typeless')).toBe(false)
  })

  it('updates latestMessage and messageCount on each pump', () => {
    const { transport, echo, changes } = makeRig()
    echo.startEcho({ name: '/demo/counter', type: 'std_msgs/msg/Int32' })
    transport.pump('/demo/counter', { data: 1 })
    transport.pump('/demo/counter', { data: 2 })

    const s = echo.sessions[0]
    expect(s.latestMessage).toEqual({ data: 2 })
    expect(s.messageCount).toBe(2)
    expect(typeof s.lastReceivedAt).toBe('number')

    // 1 emit on start + 1 per pump = 3 snapshots.
    expect(changes.length).toBeGreaterThanOrEqual(3)
  })

  it('startEcho is idempotent for an already-listening session', () => {
    const { transport, echo } = makeRig()
    echo.startEcho({ name: '/x', type: 't' })
    echo.startEcho({ name: '/x', type: 't' })
    expect(echo.sessions).toHaveLength(1)
    // Only one subscription on the wire.
    expect(transport.handlers.get('/x')?.size).toBe(1)
  })

  it('startEcho on a stopped session resumes streaming', () => {
    const { transport, echo, changes } = makeRig()
    echo.startEcho({ name: '/x', type: 't' })
    echo.stopEcho('/x')
    expect(echo.sessions[0].status).toBe('stopped')

    echo.startEcho({ name: '/x', type: 't' })
    expect(echo.sessions[0].status).toBe('listening')

    // Next message should be received.
    transport.pump('/x', { value: 42 })
    expect(echo.sessions[0].latestMessage).toEqual({ value: 42 })
    expect(changes.at(-1)?.[0].latestMessage).toEqual({ value: 42 })
  })

  it('startEcho fills in a previously-missing topic type', () => {
    const { echo } = makeRig()
    echo.startEcho({ name: '/x' })
    expect(echo.sessions[0].topicType).toBeUndefined()

    echo.startEcho({ name: '/x', type: 'std_msgs/msg/String' })
    expect(echo.sessions[0].topicType).toBe('std_msgs/msg/String')
  })
})

describe('RosbridgeTopicEcho — stopEcho / closeEcho', () => {
  it('stopEcho unsubscribes but keeps the session card visible with the last message', () => {
    const { transport, echo } = makeRig()
    echo.startEcho({ name: '/x', type: 't' })
    transport.pump('/x', { v: 1 })
    echo.stopEcho('/x')

    expect(echo.sessions).toHaveLength(1)
    const s = echo.sessions[0]
    expect(s.status).toBe('stopped')
    expect(s.latestMessage).toEqual({ v: 1 })
    expect(transport.unsubscribeCalls).toContain('/x')
    expect(transport.hasSubscribers('/x')).toBe(false)
  })

  it('a frame arriving after stopEcho does not promote the session back to listening', () => {
    const { transport, echo } = makeRig()
    echo.startEcho({ name: '/x', type: 't' })

    // Reach into the fake to deliver a "late" frame even though we
    // unsubscribed — guards against a buggy or async transport.
    const handler = [...(transport.handlers.get('/x') ?? [])][0]
    echo.stopEcho('/x')
    handler({ v: 99 })

    expect(echo.sessions[0].status).toBe('stopped')
  })

  it('closeEcho removes the session entirely', () => {
    const { echo } = makeRig()
    echo.startEcho({ name: '/x', type: 't' })
    echo.closeEcho('/x')
    expect(echo.sessions).toEqual([])
  })

  it('closeEcho unsubscribes a still-listening session', () => {
    const { transport, echo } = makeRig()
    echo.startEcho({ name: '/x', type: 't' })
    echo.closeEcho('/x')
    expect(transport.unsubscribeCalls).toContain('/x')
  })

  it('stopEcho / closeEcho on an unknown topic is a no-op', () => {
    const { echo, changes } = makeRig()
    echo.stopEcho('/nope')
    echo.closeEcho('/nope')
    expect(changes).toEqual([])
    expect(echo.sessions).toEqual([])
  })
})

describe('RosbridgeTopicEcho — error handling', () => {
  it('marks the session as error if subscribe throws', () => {
    const { transport, echo } = makeRig()
    transport.subscribeShouldThrow = true
    echo.startEcho({ name: '/x', type: 't' })

    const s = echo.sessions[0]
    expect(s.status).toBe('error')
    expect(s.error).toBe('subscribe failed')
  })
})

describe('RosbridgeTopicEcho — closeAll', () => {
  it('tears down every session and emits one final snapshot', () => {
    const { transport, echo, changes } = makeRig()
    echo.startEcho({ name: '/a', type: 't' })
    echo.startEcho({ name: '/b', type: 't' })
    expect(echo.sessions).toHaveLength(2)

    echo.closeAll()
    expect(echo.sessions).toEqual([])
    expect(transport.unsubscribeCalls).toEqual(
      expect.arrayContaining(['/a', '/b']),
    )
    // Last emit is the empty snapshot.
    expect(changes.at(-1)).toEqual([])
  })

  it('closeAll on an empty echo is a no-op', () => {
    const { echo, changes } = makeRig()
    echo.closeAll()
    expect(changes).toEqual([])
  })
})

describe('RosbridgeTopicEcho — multiple topics in parallel', () => {
  it('routes messages to the right session', () => {
    const { transport, echo } = makeRig()
    echo.startEcho({ name: '/a', type: 'std_msgs/msg/Int32' })
    echo.startEcho({ name: '/b', type: 'std_msgs/msg/String' })

    transport.pump('/a', { data: 1 })
    transport.pump('/b', { data: 'hi' })

    const a = echo.sessions.find((s) => s.topicName === '/a')!
    const b = echo.sessions.find((s) => s.topicName === '/b')!
    expect(a.latestMessage).toEqual({ data: 1 })
    expect(b.latestMessage).toEqual({ data: 'hi' })
  })
})

describe('RosbridgeTopicEcho — input hardening', () => {
  it('ignores startEcho with an invalid topic descriptor', () => {
    const { echo, changes } = makeRig()
    echo.startEcho({ name: '' })
    echo.startEcho({} as never)
    expect(echo.sessions).toEqual([])
    expect(changes).toEqual([])
  })

  it('emits a fresh snapshot on a no-op startEcho re-call so subscribers can rely on intent semantics', () => {
    const { echo } = makeRig()
    const onChange = vi.fn()
    const echoWithSpy = new RosbridgeTopicEcho(
      {
        setTopicType: () => {},
        subscribe: () => () => {},
      },
      onChange,
    )
    echoWithSpy.startEcho({ name: '/x', type: 't' })
    onChange.mockClear()
    echoWithSpy.startEcho({ name: '/x', type: 't' }) // already listening
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(echo).toBeDefined()
  })
})
