import { useContext } from 'react'
import { CommunicationContext } from './CommunicationContext'
import type { RenderableTopicCapability } from './RenderableTopics'

/**
 * UI hook for the optional renderable-topic capability surfaced by
 * `CommunicationProvider`. Returns `undefined` when the active
 * transport doesn't expose render selection (today: anything other
 * than a connected `rosbridge`). Components must check the return
 * value before calling — there's no shim that throws.
 */
export function useRenderableTopics():
  | RenderableTopicCapability
  | undefined {
  return useContext(CommunicationContext).renderableTopics
}
