import { describe, expect, it, vi } from 'vitest'
import {
  RosbridgeRenderableTopics,
  type RenderableSubscriber,
} from './RosbridgeRenderableTopics'
import type { RenderableTopicSelection } from '../../../app/RenderableTopics'
import { ExternalPathUpdateQueue } from '../../../simulation/paths/ExternalPathUpdateQueue'

class FakeSubscriber implements RenderableSubscriber {
  topicTypes = new Map<string, string>()
  handlers = new Map<string, Set<(msg: unknown) => void>>()
  unsubscribeCalls: string[] = []
  subscribeShouldThrow = false

  setTopicType(topic: string, messageType: string): void {
    this.topicTypes.set(topic, messageType)
  }

  subscribe<T>(topic: string, handler: (message: T) => void): () => void {
    if (this.subscribeShouldThrow) throw new Error('subscribe failed')
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
    return Boolean(this.handlers.get(topic)?.size)
  }
}

interface Rig {
  subscriber: FakeSubscriber
  queue: ExternalPathUpdateQueue
  capability: RosbridgeRenderableTopics
  changes: RenderableTopicSelection[][]
}

function makeRig(): Rig {
  const subscriber = new FakeSubscriber()
  const queue = new ExternalPathUpdateQueue()
  const changes: RenderableTopicSelection[][] = []
  const capability = new RosbridgeRenderableTopics(subscriber, queue, {
    onChange: (s) => changes.push(s),
  })
  return { subscriber, queue, capability, changes }
}

const SUPPORTED = {
  name: '/circle_path',
  type: 'nav_msgs/msg/Path',
} as const

describe('RosbridgeRenderableTopics — whitelist gating', () => {
  it('isRenderable returns true for the whitelisted topic name and type', () => {
    const { capability } = makeRig()
    expect(capability.isRenderable(SUPPORTED)).toBe(true)
    expect(capability.getUnsupportedReason(SUPPORTED)).toBeUndefined()
  })

  it('isRenderable returns false for an unknown topic name', () => {
    const { capability } = makeRig()
    expect(
      capability.isRenderable({
        name: '/random',
        type: 'nav_msgs/msg/Path',
      }),
    ).toBe(false)
    expect(
      capability.getUnsupportedReason({
        name: '/random',
        type: 'nav_msgs/msg/Path',
      }),
    ).toMatch(/not supported/)
  })

  it('isRenderable returns false when the type does not match the whitelist', () => {
    const { capability } = makeRig()
    expect(
      capability.isRenderable({
        name: '/circle_path',
        type: 'std_msgs/msg/String',
      }),
    ).toBe(false)
  })

  it('treats a missing topic type as a wildcard match (UI hasn\'t resolved type yet)', () => {
    const { capability } = makeRig()
    expect(capability.isRenderable({ name: '/circle_path' })).toBe(true)
  })
})

describe('RosbridgeRenderableTopics — selectTopic / deselectTopic', () => {
  it('selectTopic subscribes, registers the topic type, and emits a snapshot', () => {
    const { subscriber, capability, changes } = makeRig()
    capability.selectTopic(SUPPORTED)
    expect(subscriber.topicTypes.get('/circle_path')).toBe(
      'nav_msgs/msg/Path',
    )
    expect(subscriber.hasSubscribers('/circle_path')).toBe(true)
    expect(capability.isSelected('/circle_path')).toBe(true)
    expect(capability.selectedTopics).toEqual([
      {
        topicName: '/circle_path',
        messageType: 'nav_msgs/msg/Path',
        kind: 'path2d',
      },
    ])
    expect(changes.at(-1)).toEqual(capability.selectedTopics)
  })

  it('selectTopic on a non-whitelisted topic is a no-op', () => {
    const { subscriber, capability, changes } = makeRig()
    capability.selectTopic({ name: '/random', type: 'std_msgs/msg/String' })
    expect(subscriber.handlers.size).toBe(0)
    expect(capability.selectedTopics).toEqual([])
    expect(changes).toEqual([])
  })

  it('selectTopic is idempotent for an already-selected topic', () => {
    const { subscriber, capability } = makeRig()
    capability.selectTopic(SUPPORTED)
    capability.selectTopic(SUPPORTED)
    expect(capability.selectedTopics).toHaveLength(1)
    expect(subscriber.handlers.get('/circle_path')?.size).toBe(1)
  })

  it('deselectTopic unsubscribes, removes the selection, and enqueues a remove', () => {
    const { subscriber, queue, capability } = makeRig()
    capability.selectTopic(SUPPORTED)
    capability.deselectTopic('/circle_path')

    expect(capability.isSelected('/circle_path')).toBe(false)
    expect(capability.selectedTopics).toEqual([])
    expect(subscriber.unsubscribeCalls).toContain('/circle_path')
    expect(subscriber.hasSubscribers('/circle_path')).toBe(false)

    const pending = queue.drain()
    expect(pending).toEqual([{ kind: 'remove', id: '/circle_path' }])
  })

  it('deselectTopic on an unselected topic is a no-op', () => {
    const { capability, changes, queue } = makeRig()
    capability.deselectTopic('/circle_path')
    expect(changes).toEqual([])
    expect(queue.drain()).toEqual([])
  })

  it('throws if subscribe throws (caller is the onClick — it is responsible for surfacing)', () => {
    const { subscriber, capability } = makeRig()
    subscriber.subscribeShouldThrow = true
    expect(() => capability.selectTopic(SUPPORTED)).toThrow(/subscribe failed/)
    // The selection should NOT be retained on failure.
    expect(capability.isSelected('/circle_path')).toBe(false)
  })
})

describe('RosbridgeRenderableTopics — message routing', () => {
  it('a Path message pumped into the subscriber lands in the queue as an upsert', () => {
    const { subscriber, queue, capability } = makeRig()
    capability.selectTopic(SUPPORTED)

    subscriber.pump('/circle_path', {
      header: { frame_id: 'map' },
      poses: [
        {
          pose: {
            position: { x: 1, y: 2, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    })

    const pending = queue.drain()
    expect(pending).toHaveLength(1)
    expect(pending[0].kind).toBe('upsert')
    if (pending[0].kind === 'upsert') {
      expect(pending[0].path.id).toBe('/circle_path')
      expect(pending[0].path.frameId).toBe('map')
      expect(pending[0].path.points).toEqual([{ x: 1, y: 2, yaw: 0 }])
    }
  })

  it('a malformed payload is swallowed (no enqueue) so the subscription survives', () => {
    const { subscriber, queue, capability } = makeRig()
    capability.selectTopic(SUPPORTED)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      subscriber.pump('/circle_path', { not: 'a path' })
      expect(queue.drain()).toEqual([])
      expect(warn).toHaveBeenCalled()
    } finally {
      warn.mockRestore()
    }
  })
})

describe('RosbridgeRenderableTopics — closeAll', () => {
  it('tears down every subscription and enqueues a remove per selection', () => {
    const { subscriber, queue, capability, changes } = makeRig()
    capability.selectTopic(SUPPORTED)
    expect(capability.selectedTopics).toHaveLength(1)

    capability.closeAll()
    expect(capability.selectedTopics).toEqual([])
    expect(subscriber.unsubscribeCalls).toContain('/circle_path')
    expect(changes.at(-1)).toEqual([])

    expect(queue.drain()).toEqual([{ kind: 'remove', id: '/circle_path' }])
  })

  it('closeAll on an empty capability is a no-op', () => {
    const { capability, changes, queue } = makeRig()
    capability.closeAll()
    expect(changes).toEqual([])
    expect(queue.drain()).toEqual([])
  })
})

describe('RosbridgeRenderableTopics — overrides', () => {
  it('respects a custom whitelist (e.g. for tests)', () => {
    const subscriber = new FakeSubscriber()
    const queue = new ExternalPathUpdateQueue()
    const capability = new RosbridgeRenderableTopics(subscriber, queue, {
      whitelist: [
        { topicName: '/x', messageType: 'std_msgs/msg/Empty', kind: 'path2d' },
      ],
    })
    expect(capability.isRenderable({ name: '/circle_path' })).toBe(false)
    expect(capability.isRenderable({ name: '/x' })).toBe(true)
  })

  it('uses pathIdFor to key state.paths entries', () => {
    const subscriber = new FakeSubscriber()
    const queue = new ExternalPathUpdateQueue()
    const capability = new RosbridgeRenderableTopics(subscriber, queue, {
      pathIdFor: (s) => `external-${s.topicName}`,
    })
    capability.selectTopic(SUPPORTED)
    capability.deselectTopic('/circle_path')
    expect(queue.drain()).toEqual([
      { kind: 'remove', id: 'external-/circle_path' },
    ])
  })
})
