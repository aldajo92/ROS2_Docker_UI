import { describe, expect, it } from 'vitest'
import {
  RENDERABLE_TOPIC_WHITELIST,
  RENDER_UNSUPPORTED_REASON,
  findRenderableSupport,
} from './RenderableTopics'

describe('RenderableTopics — whitelist', () => {
  it('exposes /circle_path as nav_msgs/msg/Path of kind path2d', () => {
    const entry = RENDERABLE_TOPIC_WHITELIST.find(
      (e) => e.topicName === '/circle_path',
    )
    expect(entry).toBeDefined()
    expect(entry?.messageType).toBe('nav_msgs/msg/Path')
    expect(entry?.kind).toBe('path2d')
  })

  it('exposes a stable reason text constant', () => {
    expect(RENDER_UNSUPPORTED_REASON).toMatch(/not supported/i)
  })
})

describe('RenderableTopics — findRenderableSupport', () => {
  it('matches a discovered topic with the same name + type', () => {
    expect(
      findRenderableSupport({
        name: '/circle_path',
        type: 'nav_msgs/msg/Path',
      }),
    ).toBeDefined()
  })

  it('matches when the topic type is unknown (UI hasn\'t resolved it yet)', () => {
    expect(findRenderableSupport({ name: '/circle_path' })).toBeDefined()
  })

  it('does NOT match when the type is set but disagrees with the whitelist', () => {
    expect(
      findRenderableSupport({
        name: '/circle_path',
        type: 'std_msgs/msg/String',
      }),
    ).toBeUndefined()
  })

  it('does NOT match an unknown topic name', () => {
    expect(
      findRenderableSupport({
        name: '/nope',
        type: 'nav_msgs/msg/Path',
      }),
    ).toBeUndefined()
  })

  it('respects a custom whitelist', () => {
    const list = [
      { topicName: '/x', messageType: 'std_msgs/msg/Empty', kind: 'path2d' as const },
    ]
    expect(findRenderableSupport({ name: '/x' }, list)).toBeDefined()
    expect(findRenderableSupport({ name: '/circle_path' }, list)).toBeUndefined()
  })

  it('rejects malformed input gracefully', () => {
    expect(
      findRenderableSupport(undefined as unknown as Parameters<typeof findRenderableSupport>[0]),
    ).toBeUndefined()
  })
})
