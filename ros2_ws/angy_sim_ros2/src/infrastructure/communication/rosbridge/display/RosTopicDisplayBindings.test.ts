import { describe, expect, it } from 'vitest'
import {
  ROS_TOPIC_DISPLAY_BINDINGS,
  findRosTopicDisplayBinding,
} from './RosTopicDisplayBindings'
import { RosPathToPath2DAdapter } from '../adapters/RosPathToPath2DAdapter'

describe('RosTopicDisplayBindings — registry', () => {
  it('ROS_TOPIC_DISPLAY_BINDINGS is frozen', () => {
    expect(Object.isFrozen(ROS_TOPIC_DISPLAY_BINDINGS)).toBe(true)
  })

  it('nav_msgs/msg/Path resolves to displayPluginId path2d', () => {
    const binding = findRosTopicDisplayBinding('nav_msgs/msg/Path')
    expect(binding).toBeDefined()
    expect(binding?.displayPluginId).toBe('path2d')
    expect(binding?.messageType).toBe('nav_msgs/msg/Path')
  })

  it('unknown message type returns undefined', () => {
    expect(findRosTopicDisplayBinding('std_msgs/msg/String')).toBeUndefined()
    expect(findRosTopicDisplayBinding('')).toBeUndefined()
    expect(findRosTopicDisplayBinding('nav_msgs/msg/Odometry')).toBeUndefined()
  })
})

describe('RosTopicDisplayBindings — createAdapter', () => {
  it('produces a RosPathToPath2DAdapter instance for nav_msgs/msg/Path', () => {
    const binding = findRosTopicDisplayBinding('nav_msgs/msg/Path')!
    const adapter = binding.createAdapter({ artifactId: 'my-path' })
    expect(adapter).toBeInstanceOf(RosPathToPath2DAdapter)
  })

  it('adapter converts a minimal path message correctly', () => {
    const binding = findRosTopicDisplayBinding('nav_msgs/msg/Path')!
    const adapter = binding.createAdapter({
      artifactId: 'p1',
      artifactName: 'My Path',
    })
    const path = adapter.toInternal({
      header: { frame_id: 'odom' },
      poses: [
        {
          pose: {
            position: { x: 1, y: 2, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    })
    expect(path.id).toBe('p1')
    expect(path.frameId).toBe('odom')
    expect(path.points).toHaveLength(1)
    expect(path.points[0]).toMatchObject({ x: 1, y: 2 })
  })

  it('each createAdapter call returns an independent adapter instance', () => {
    const binding = findRosTopicDisplayBinding('nav_msgs/msg/Path')!
    const a1 = binding.createAdapter({ artifactId: 'topic-a' })
    const a2 = binding.createAdapter({ artifactId: 'topic-b' })
    expect(a1).not.toBe(a2)
    expect(a1.toInternal({ header: {}, poses: [] }).id).toBe('topic-a')
    expect(a2.toInternal({ header: {}, poses: [] }).id).toBe('topic-b')
  })
})

describe('RosTopicDisplayBindings — custom bindings override', () => {
  it('respects a custom bindings array passed to findRosTopicDisplayBinding', () => {
    const custom = [
      {
        messageType: 'custom/Msg',
        displayPluginId: 'custom-plugin',
        createAdapter: () => ({
          toInternal: () => ({}),
          fromInternal: () => ({}),
        }),
      },
    ]
    expect(
      findRosTopicDisplayBinding('nav_msgs/msg/Path', custom as never),
    ).toBeUndefined()
    expect(
      findRosTopicDisplayBinding('custom/Msg', custom as never)?.displayPluginId,
    ).toBe('custom-plugin')
  })
})
