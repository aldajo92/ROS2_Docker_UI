/**
 * Composition-root knobs that pick which `Transport` implementation
 * the React shell should construct. The simulation core never reads
 * these — it only ever sees the abstract `Transport` interface.
 *
 * Today we ship four kinds:
 *   - `none`      → don't wire any transport (engine runs offline).
 *   - `mock`      → in-process `MockTransport` for local dev / tests.
 *   - `memory`    → in-process `InMemoryTransport` (microtask dispatch).
 *   - `rosbridge` → `RoslibRosbridgeTransport` against rosbridge_server.
 *
 * Adding `dds`, `mqtt`, `webrtc`, `backend-gateway`, … only requires
 * extending `TransportKind`, the parser below, and the factory in
 * `CommunicationProvider.tsx`. Bridges, adapters, and the engine stay
 * untouched — that is the whole point of the layered architecture
 * (see Architecture.md, Layer 8).
 */

export type TransportKind = 'none' | 'mock' | 'memory' | 'rosbridge'

export interface TransportConfig {
  kind: TransportKind
  /** Required when `kind === 'rosbridge'`. */
  rosbridgeUrl: string
}

export const DEFAULT_ROSBRIDGE_URL = 'ws://localhost:9090'

export const DEFAULT_TRANSPORT_CONFIG: TransportConfig = {
  kind: 'none',
  rosbridgeUrl: DEFAULT_ROSBRIDGE_URL,
}

const KNOWN_KINDS: ReadonlyArray<TransportKind> = [
  'none',
  'mock',
  'memory',
  'rosbridge',
]

function parseTransportKind(raw: string | undefined): TransportKind {
  if (raw === undefined) return 'none'
  const normalized = raw.trim().toLowerCase()
  if (normalized === '') return 'none'
  if ((KNOWN_KINDS as readonly string[]).includes(normalized)) {
    return normalized as TransportKind
  }
  // Unknown values fall back to `none` rather than throwing — env
  // typos shouldn't bring down the UI. The reason is logged so the
  // operator can fix it.
  console.warn(
    `[TransportConfig] Unknown VITE_TRANSPORT_KIND="${raw}". Falling back to "none". Allowed: ${KNOWN_KINDS.join(', ')}.`,
  )
  return 'none'
}

/**
 * Read transport configuration from a Vite-style `import.meta.env`
 * object. Exposed as a pure helper (env is the parameter) so unit
 * tests can feed deterministic values.
 *
 * Recognized variables:
 *   - `VITE_TRANSPORT_KIND`    one of `none | mock | memory | rosbridge`
 *   - `VITE_ROSBRIDGE_URL`     defaults to `ws://localhost:9090`
 */
export function readTransportConfig(
  env: Record<string, string | undefined>,
): TransportConfig {
  const kind = parseTransportKind(env.VITE_TRANSPORT_KIND)
  const url = (env.VITE_ROSBRIDGE_URL ?? '').trim()
  return {
    kind,
    rosbridgeUrl: url.length > 0 ? url : DEFAULT_ROSBRIDGE_URL,
  }
}
