import { describe, expect, it } from 'vitest'
import {
  RENDERABLE_TOPIC_WHITELIST,
  RENDER_UNSUPPORTED_REASON,
  findRenderableSupport,
} from './RenderableTopics'

describe('RenderableTopics — whitelist', () => {
  it('exposes nav_msgs/msg/Path as kind path2d', () => {
    const entry = RENDERABLE_TOPIC_WHITELIST.find(
      (e) => e.messageType === 'nav_msgs/msg/Path',
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
  it('matches a discovered topic with the same type', () => {
    expect(
      findRenderableSupport({
        name: '/any_topic_name',
        type: 'nav_msgs/msg/Path',
      }),
    ).toBeDefined()
  })

  it('does NOT match when topic type is unknown', () => {
    expect(findRenderableSupport({ name: '/circle_path' })).toBeUndefined()
  })

  it('does NOT match when the type disagrees with the whitelist', () => {
    expect(
      findRenderableSupport({
        name: '/circle_path',
        type: 'std_msgs/msg/String',
      }),
    ).toBeUndefined()
  })

  it('matches any topic name when the type is supported', () => {
    expect(
      findRenderableSupport({
        name: '/nope',
        type: 'nav_msgs/msg/Path',
      }),
    ).toBeDefined()
  })

  it('respects a custom whitelist', () => {
    const list = [
      { messageType: 'std_msgs/msg/Empty', kind: 'path2d' as const },
    ]
    expect(findRenderableSupport({ name: '/x', type: 'std_msgs/msg/Empty' }, list)).toBeDefined()
    expect(findRenderableSupport({ name: '/circle_path', type: 'nav_msgs/msg/Path' }, list)).toBeUndefined()
  })

  it('rejects malformed input gracefully', () => {
    expect(
      findRenderableSupport(undefined as unknown as Parameters<typeof findRenderableSupport>[0]),
    ).toBeUndefined()
  })
})
