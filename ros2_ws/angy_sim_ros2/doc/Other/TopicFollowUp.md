Small architecture clarification before implementing:

The previous prompt is correct in terms of UX, but please make sure the implementation stays capability-based and not rosbridge-coupled.

The UI card can be named "ROS2 Topics", and it should still only render when the selected transport is rosbridge and the connection is connected.

However, internally:
- Do not expose a rosbridge-specific API directly to Ros2TopicsPanel.
- Do not let Ros2TopicsPanel import roslib, rosapi helpers, or RoslibRosbridgeTransport.
- Add a generic provider-facing capability, for example TopicDiscoveryCapability.
- Rosbridge can implement that capability internally using rosapi through rosbridge.
- Future transports should be able to provide their own TopicDiscoveryCapability without changing the UI.

Suggested shape:

TopicDiscoveryCapability:
- refreshTopics(): Promise<void>
- topics: DiscoveredTopic[]
- status: "idle" | "loading" | "ready" | "error"
- error?: string
- lastUpdated?: number
- echoTopic?(topicName: string): Promise<void>
- stopEcho?(topicName: string): void
- latestMessages?: Record<string, unknown>

DiscoveredTopic:
- name: string
- type?: string
- isSystem?: boolean

If Echo is implemented, it must go through this capability, not through direct roslib usage in the UI.

So the implementation should be:

Ros2TopicsPanel
  -> uses app/provider TopicDiscoveryCapability
  -> does not know about rosbridge internals

CommunicationProvider / app composition root
  -> exposes TopicDiscoveryCapability when transportKind === "rosbridge"

src/infrastructure/communication/rosbridge/
  -> implements rosbridge-specific topic discovery using rosapi

Please keep the Connection card and ROS2 Topics card separated as requested in the previous prompt.