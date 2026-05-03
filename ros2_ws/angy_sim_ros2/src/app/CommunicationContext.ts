import { createContext } from 'react'
import type { TransportConfig } from './TransportConfig'

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
