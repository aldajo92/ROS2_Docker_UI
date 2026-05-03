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
}

/**
 * Lives in its own module so `CommunicationProvider.tsx` can be a
 * components-only file (required by Vite's react-refresh plugin).
 */
export const CommunicationContext = createContext<CommunicationContextValue>({
  config: { kind: 'none', rosbridgeUrl: '' },
  status: 'disabled',
})
