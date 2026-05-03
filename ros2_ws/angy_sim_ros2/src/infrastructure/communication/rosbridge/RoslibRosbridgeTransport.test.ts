import { describe, expect, it, vi } from 'vitest'
import {
  RoslibRosbridgeTransport,
  type RosFactory,
  type RosLike,
  type TopicFactory,
  type TopicLike,
} from './RoslibRosbridgeTransport'

/* ---------------------- fake roslib doubles ---------------------- */
//
// The real `Ros` / `Topic` classes are not loaded by these tests:
// `RoslibRosbridgeTransport` `import type`s from `roslib`, and the
// constructor accepts factories so unit tests don't need a live
// rosbridge server (or the roslib runtime, which transitively pulls
// in `ws` and friends).

class FakeRos implements RosLike {
  isConnected = false
  closed = false
  connectCalls: string[] = []
  private listeners: Record<string, Set<(arg?: unknown) => void>> = {
    connection: new Set(),
    error: new Set(),
    close: new Set(),
  }

  on(event: 'connection' | 'error' | 'close', listener: (arg?: unknown) => void): unknown {
    this.listeners[event].add(listener)
    return this
  }

  off(event: 'connection' | 'error' | 'close', listener: (arg?: unknown) => void): unknown {
    this.listeners[event].delete(listener)
    return this
  }

  async connect(url: string): Promise<void> {
    this.connectCalls.push(url)
    this.isConnected = true
    for (const fn of [...this.listeners.connection]) fn()
  }

  close(): void {
    this.closed = true
    this.isConnected = false
    for (const fn of [...this.listeners.close]) fn()
  }

  // Test helpers — emit ROS-side events without going through connect().
  emit(event: 'connection' | 'error' | 'close', payload?: unknown): void {
    for (const fn of [...this.listeners[event]]) fn(payload)
  }
}

class FakeTopic<T> implements TopicLike<T> {
  publishedMessages: T[] = []
  subscribers = new Set<(message: T) => void>()
  advertised = false
  unadvertised = false
  readonly name: string
  readonly messageType: string

  constructor(name: string, messageType: string) {
    this.name = name
    this.messageType = messageType
  }

  publish(message: T): void {
    this.publishedMessages.push(message)
  }

  subscribe(callback: (message: T) => void): void {
    this.subscribers.add(callback)
  }

  unsubscribe(callback?: (message: T) => void): void {
    if (callback) this.subscribers.delete(callback)
    else this.subscribers.clear()
  }

  advertise(): void {
    this.advertised = true
  }

  unadvertise(): void {
    this.unadvertised = true
  }

  // Test helper — push a message as if it came from rosbridge.
  emit(message: T): void {
    for (const fn of [...this.subscribers]) fn(message)
  }
}

interface Rig {
  transport: RoslibRosbridgeTransport
  ros: FakeRos
  topics: Map<string, FakeTopic<unknown>>
  rosFactory: ReturnType<typeof vi.fn>
  topicFactory: ReturnType<typeof vi.fn>
}

function makeRig(
  options: {
    topicTypes?: Record<string, string>
    autoConnect?: boolean
  } = {},
): Rig {
  const ros = new FakeRos()
  const topics = new Map<string, FakeTopic<unknown>>()

  const rosFactorySpy = vi.fn(() => ros)
  const rosFactory: RosFactory = rosFactorySpy

  // The TopicFactory signature is generic (`<T>(...) => TopicLike<T>`)
  // but `vi.fn` infers a concrete monomorphic type. Wrap the spy in a
  // tiny generic lambda so the concrete return is widened back to a
  // generic Topic — keeps the production signature honest while still
  // letting tests assert on the spy via `topicFactorySpy`.
  const topicFactorySpy = vi.fn((args: { name: string; messageType: string }) => {
    const t = new FakeTopic<unknown>(args.name, args.messageType)
    topics.set(args.name, t)
    return t
  })
  const topicFactory: TopicFactory = <T = unknown>(args: {
    ros: RosLike
    name: string
    messageType: string
  }) => topicFactorySpy(args) as unknown as TopicLike<T>

  const transport = new RoslibRosbridgeTransport({
    url: 'ws://test:9090',
    topicTypes: options.topicTypes ?? {
      '/cmd_vel': 'geometry_msgs/msg/Twist',
      '/clock': 'rosgraph_msgs/msg/Clock',
    },
    rosFactory,
    topicFactory,
  })

  return {
    transport,
    ros,
    topics,
    rosFactory: rosFactorySpy,
    topicFactory: topicFactorySpy,
  }
}

/* --------------------------- tests --------------------------- */

describe('RoslibRosbridgeTransport — lifecycle', () => {
  it('starts disconnected', () => {
    const { transport } = makeRig()
    expect(transport.isConnected()).toBe(false)
    expect(transport.getStatus()).toBe('disconnected')
  })

  it('rejects an empty url at construction', () => {
    expect(
      () =>
        new RoslibRosbridgeTransport({
          url: '',
          topicTypes: {},
          rosFactory: vi.fn() as unknown as RosFactory,
          topicFactory: vi.fn() as unknown as TopicFactory,
        }),
    ).toThrow(/url/)
  })

  it('connects via the injected factory and reflects status transitions', async () => {
    const transitions: string[] = []
    const { transport, ros } = makeRig()
    transport.onStatusChange((s) => transitions.push(s))

    await transport.connect()

    expect(transport.isConnected()).toBe(true)
    expect(transport.getStatus()).toBe('connected')
    expect(ros.connectCalls).toEqual(['ws://test:9090'])
    expect(transitions).toEqual(['connecting', 'connected'])
  })

  it('disconnect() closes the underlying Ros and clears state', async () => {
    const { transport, ros } = makeRig()
    await transport.connect()
    await transport.disconnect()

    expect(ros.closed).toBe(true)
    expect(transport.isConnected()).toBe(false)
    expect(transport.getStatus()).toBe('disconnected')
  })

  it('reports "error" status when the underlying connect() rejects', async () => {
    const ros = new FakeRos()
    ros.connect = vi.fn(async () => {
      throw new Error('boom')
    }) as unknown as FakeRos['connect']

    const transitions: Array<{ status: string; err?: string }> = []
    const transport = new RoslibRosbridgeTransport({
      url: 'ws://x',
      topicTypes: {},
      rosFactory: () => ros,
      topicFactory: () => ({
        publish: () => {},
        subscribe: () => {},
        unsubscribe: () => {},
        advertise: () => {},
        unadvertise: () => {},
      }),
      onStatusChange: (status, err) => transitions.push({ status, err }),
    })

    await expect(transport.connect()).rejects.toThrow(/boom/)
    expect(transport.getStatus()).toBe('error')
    expect(transitions.map((t) => t.status)).toEqual(['connecting', 'error'])
    expect(transitions[1].err).toMatch(/boom/)
  })

  it('reports "error" when ros emits an error event', async () => {
    const transitions: string[] = []
    const { transport, ros } = makeRig()
    transport.onStatusChange((s) => transitions.push(s))

    await transport.connect()
    expect(transitions).toEqual(['connecting', 'connected'])

    ros.emit('error', new Error('socket dropped'))
    expect(transport.getStatus()).toBe('error')
    expect(transitions).toEqual(['connecting', 'connected', 'error'])
  })

  it('reports "disconnected" when the socket closes unexpectedly', async () => {
    const transitions: string[] = []
    const { transport, ros } = makeRig()
    transport.onStatusChange((s) => transitions.push(s))

    await transport.connect()
    ros.emit('close')
    expect(transport.getStatus()).toBe('disconnected')
    expect(transitions).toEqual(['connecting', 'connected', 'disconnected'])
  })
})

describe('RoslibRosbridgeTransport — publish', () => {
  it('lazily creates a Topic with the configured messageType and forwards messages', async () => {
    const { transport, topicFactory, topics } = makeRig()
    await transport.connect()

    await transport.publish('/cmd_vel', {
      linear: { x: 1, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0.2 },
    })

    expect(topicFactory).toHaveBeenCalledTimes(1)
    expect(topicFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        name: '/cmd_vel',
        messageType: 'geometry_msgs/msg/Twist',
      }),
    )

    const t = topics.get('/cmd_vel')
    expect(t?.advertised).toBe(true)
    expect(t?.publishedMessages).toEqual([
      { linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.2 } },
    ])
  })

  it('reuses the same Topic across consecutive publishes', async () => {
    const { transport, topicFactory } = makeRig()
    await transport.connect()
    await transport.publish('/cmd_vel', {})
    await transport.publish('/cmd_vel', {})
    expect(topicFactory).toHaveBeenCalledTimes(1)
  })

  it('throws when no messageType is registered for the topic', async () => {
    const { transport } = makeRig({ topicTypes: {} })
    await transport.connect()
    await expect(transport.publish('/unknown', {})).rejects.toThrow(
      /no ROS message type/,
    )
  })

  it('refuses to publish before connect()', async () => {
    const { transport } = makeRig()
    await expect(transport.publish('/cmd_vel', {})).rejects.toThrow(
      /before connect/,
    )
  })
})

describe('RoslibRosbridgeTransport — subscribe', () => {
  it('routes incoming messages to every registered handler', async () => {
    const { transport, topics } = makeRig()
    await transport.connect()

    const a = vi.fn()
    const b = vi.fn()
    transport.subscribe('/cmd_vel', a)
    transport.subscribe('/cmd_vel', b)

    const t = topics.get('/cmd_vel') as FakeTopic<unknown>
    t.emit({ linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('returns an idempotent unsubscribe', async () => {
    const { transport, topics } = makeRig()
    await transport.connect()
    const handler = vi.fn()
    const off = transport.subscribe('/cmd_vel', handler)

    const t = topics.get('/cmd_vel') as FakeTopic<unknown>

    off()
    off() // second call must be a no-op
    t.emit({ linear: { x: 1, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } })

    expect(handler).not.toHaveBeenCalled()
  })

  it('unsubscribes from the underlying topic when the last handler leaves', async () => {
    const { transport, topics } = makeRig()
    await transport.connect()
    const off1 = transport.subscribe('/cmd_vel', vi.fn())
    const off2 = transport.subscribe('/cmd_vel', vi.fn())

    const t = topics.get('/cmd_vel') as FakeTopic<unknown>

    off1()
    expect(t.subscribers.size).toBe(1) // fanout still wired

    off2()
    expect(t.subscribers.size).toBe(0)
  })

  it('does not let a throwing handler block its peers', async () => {
    const { transport, topics } = makeRig()
    await transport.connect()
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const ok = vi.fn()
    transport.subscribe('/cmd_vel', () => {
      throw new Error('handler explosion')
    })
    transport.subscribe('/cmd_vel', ok)

    const t = topics.get('/cmd_vel') as FakeTopic<unknown>
    t.emit({ linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } })

    expect(ok).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  it('refuses to subscribe before connect()', () => {
    const { transport } = makeRig()
    expect(() => transport.subscribe('/cmd_vel', vi.fn())).toThrow(
      /before connect/,
    )
  })
})
