import { useContext } from 'react'
import { CommunicationContext } from './CommunicationContext'
import type { TopicEchoCapability } from './TopicEcho'

/**
 * UI hook for the optional live topic-echo capability surfaced by
 * `CommunicationProvider`. Returns `undefined` when the active
 * transport doesn't support echo (today: anything other than a
 * connected rosbridge). Components that consume it must check the
 * return value before calling — there's no shim that throws.
 */
export function useTopicEcho(): TopicEchoCapability | undefined {
  return useContext(CommunicationContext).topicEcho
}
