import { describe, expect, it } from 'vitest'
import { isSystemTopic } from './TopicDiscovery'

describe('isSystemTopic', () => {
  const systemTopics = [
    '/rosout',
    '/parameter_events',
    '/client_count',
    '/connected_clients',
    '/rosapi/topics',
    '/rosapi/services',
    '/rosapi/get_param',
    '/rosapi',
  ]

  for (const t of systemTopics) {
    it(`treats ${t} as a system topic`, () => {
      expect(isSystemTopic(t)).toBe(true)
    })
  }

  const userTopics = [
    '/demo/counter',
    '/demo/string_message',
    '/cmd_vel',
    '/clock',
    '/parameter_events_user',
    '/rosapis/anything',
    '/parameter',
    '/my_robot/sensor',
  ]

  for (const t of userTopics) {
    it(`treats ${t} as a user topic`, () => {
      expect(isSystemTopic(t)).toBe(false)
    })
  }
})
