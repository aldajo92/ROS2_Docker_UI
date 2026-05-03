import { createContext } from 'react'
import type { TransportConfig } from './TransportConfig'
import type { TopicDiscoveryState } from './TopicDiscovery'
import type { TopicEchoCapability } from './TopicEcho'
import type { RenderableTopicCapability } from './RenderableTopics'

/**
 * Connection status surfaced to the UI. The values mirror
 * `RosbridgeStatus` but are intentionally redeclared here so the React
 * shell does not import a rosbridge-specific type — `'error'` /
 * `'connecting'` / `'connected'` / `'disconnected'` are how every
 * Transport (DDS, MQTT, WebRTC) will eventually feed status into the
 * UI.
 */
export type TransportConnectionStatus =
  | 'disabled'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export interface CommunicationContextValue {
  /** Live config the shell built the transport from (for diagnostics). */
  config: TransportConfig
  status: TransportConnectionStatus
  errorMessage?: string
  /**
   * Replace the active transport configuration. The provider rebuilds
   * the concrete `Transport` implementation, re-wires the bridges, and
   * publishes the new `config` / `status` through context.
   *
   * The UI must never instantiate transports directly — it only picks a
   * `TransportKind` (and per-kind fields like `rosbridgeUrl`). That is
   * what keeps every Transport implementation (rosbridge, DDS, MQTT,
   * WebRTC, …) interchangeable from the shell's point of view.
   */
  setConfig: (next: TransportConfig) => void
  /**
   * Optional topic-discovery capability. Present only when the active
   * transport supports it (today: rosbridge while connected); UI
   * components must guard on `kind === 'rosbridge'` AND
   * `status === 'connected'` before rendering anything that depends
   * on it. Kept generic on purpose — the consuming UI never knows
   * whether it's rosbridge / DDS / MQTT under the hood.
   */
  topicDiscovery?: TopicDiscoveryState
  /**
   * Optional live topic-echo capability. Present only when the active
   * transport supports it (today: rosbridge while connected). UI must
   * gate rendering on `kind === 'rosbridge'` AND
   * `status === 'connected'` before exposing echo controls — the
   * provider clears this field on disconnect / transport change.
   */
  topicEcho?: TopicEchoCapability
  /**
   * Optional renderable-topic capability. Present only when the
   * active transport can wire a discovered topic into the
   * simulation's renderable artifacts (today: rosbridge while
   * connected). The UI uses this to render a per-row "render this
   * topic" checkbox; each implementation is responsible for routing
   * subscriptions through a simulation-side queue rather than
   * mutating `SimulationState` directly.
   */
  renderableTopics?: RenderableTopicCapability
}

/**
 * Lives in its own module so `CommunicationProvider.tsx` can be a
 * components-only file (required by Vite's react-refresh plugin).
 *
 * The default value covers components rendered outside a provider
 * (e.g. unit tests for the panel that supply their own mock context).
 * `setConfig` is a no-op so consumers don't need to null-check it.
 */
export const CommunicationContext = createContext<CommunicationContextValue>({
  config: { kind: 'none', rosbridgeUrl: '' },
  status: 'disabled',
  setConfig: () => {},
})
