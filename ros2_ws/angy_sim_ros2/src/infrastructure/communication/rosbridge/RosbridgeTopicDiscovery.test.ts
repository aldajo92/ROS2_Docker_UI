import { describe, expect, it, vi } from 'vitest'
import {
  parseTopicsResponse,
  ROSAPI_TOPICS_SERVICE,
  RosbridgeTopicDiscovery,
  type RosapiTopicsResponse,
  type ServiceCaller,
} from './RosbridgeTopicDiscovery'

describe('parseTopicsResponse', () => {
  it('pairs topic names with types and sorts alphabetically', () => {
    const res: RosapiTopicsResponse = {
      topics: ['/demo/string_message', '/demo/counter'],
      types: ['std_msgs/msg/String', 'std_msgs/msg/Int32'],
    }
    expect(parseTopicsResponse(res)).toEqual([
      { name: '/demo/counter', type: 'std_msgs/msg/Int32' },
      { name: '/demo/string_message', type: 'std_msgs/msg/String' },
    ])
  })

  it('returns type=undefined when the corresponding entry is missing or empty', () => {
    const res: RosapiTopicsResponse = {
      topics: ['/a', '/b', '/c'],
      types: ['std_msgs/msg/String', '', undefined as unknown as string],
    }
    const parsed = parseTopicsResponse(res)
    expect(parsed).toEqual([
      { name: '/a', type: 'std_msgs/msg/String' },
      { name: '/b', type: undefined },
      { name: '/c', type: undefined },
    ])
  })

  it('drops empty / non-string topic names', () => {
    const res = {
      topics: ['/a', '', null, '/b'],
      types: ['t1', 't2', 't3', 't4'],
    } as unknown as RosapiTopicsResponse
    const parsed = parseTopicsResponse(res)
    expect(parsed.map((t) => t.name)).toEqual(['/a', '/b'])
  })

  it('de-duplicates by topic name (keeps the first occurrence)', () => {
    const res: RosapiTopicsResponse = {
      topics: ['/a', '/a', '/b'],
      types: ['t1', 't2', 't3'],
    }
    const parsed = parseTopicsResponse(res)
    expect(parsed).toEqual([
      { name: '/a', type: 't1' },
      { name: '/b', type: 't3' },
    ])
  })

  it('handles malformed payloads gracefully', () => {
    expect(parseTopicsResponse({} as RosapiTopicsResponse)).toEqual([])
    expect(parseTopicsResponse(null as unknown as RosapiTopicsResponse)).toEqual(
      [],
    )
    expect(
      parseTopicsResponse({
        topics: ['/a'],
        // types missing entirely on the wire
      } as unknown as RosapiTopicsResponse),
    ).toEqual([{ name: '/a', type: undefined }])
  })
})

describe('RosbridgeTopicDiscovery', () => {
  it('queries /rosapi/topics with the ROS 2 service type by default', async () => {
    const caller = vi.fn<ServiceCaller>(async () => ({
      topics: ['/demo/counter'],
      types: ['std_msgs/msg/Int32'],
    }))
    const discovery = new RosbridgeTopicDiscovery(caller)

    const topics = await discovery.refreshTopics()

    expect(caller).toHaveBeenCalledTimes(1)
    expect(caller).toHaveBeenCalledWith(
      ROSAPI_TOPICS_SERVICE.name,
      ROSAPI_TOPICS_SERVICE.type,
      {},
    )
    expect(topics).toEqual([
      { name: '/demo/counter', type: 'std_msgs/msg/Int32' },
    ])
  })

  it('honors a custom service type override (ROS 1 deployments)', async () => {
    const caller = vi.fn<ServiceCaller>(async () => ({
      topics: ['/x'],
      types: [''],
    }))
    const discovery = new RosbridgeTopicDiscovery(caller, {
      topicsServiceType: 'rosapi/Topics',
    })

    await discovery.refreshTopics()

    expect(caller).toHaveBeenCalledWith(
      ROSAPI_TOPICS_SERVICE.name,
      'rosapi/Topics',
      {},
    )
  })

  it('honors a custom service name override', async () => {
    const caller = vi.fn<ServiceCaller>(async () => ({
      topics: [],
      types: [],
    }))
    const discovery = new RosbridgeTopicDiscovery(caller, {
      topicsServiceName: '/robot1/rosapi/topics',
    })

    await discovery.refreshTopics()

    expect(caller).toHaveBeenCalledWith(
      '/robot1/rosapi/topics',
      ROSAPI_TOPICS_SERVICE.type,
      {},
    )
  })

  it('propagates service-call rejections to refreshTopics', async () => {
    const caller = vi.fn<ServiceCaller>(async () => {
      throw new Error('socket closed')
    })
    const discovery = new RosbridgeTopicDiscovery(caller)
    await expect(discovery.refreshTopics()).rejects.toThrow('socket closed')
  })
})
