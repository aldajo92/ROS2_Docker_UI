import { useContext } from 'react'
import { CommunicationContext } from './CommunicationContext'
import type { TopicDiscoveryState } from './TopicDiscovery'

/**
 * UI hook for the optional topic-discovery capability surfaced by
 * `CommunicationProvider`. Returns `undefined` when the active
 * transport doesn't expose discovery (today: anything other than a
 * connected `rosbridge` transport). Components are expected to bail
 * early in that case rather than render a half-empty card.
 */
export function useTopicDiscovery(): TopicDiscoveryState | undefined {
  return useContext(CommunicationContext).topicDiscovery
}
