import { useRef } from 'react'
import { useTransportStatus } from '../app/useTransportStatus'
import {
  DEFAULT_ROSBRIDGE_URL,
  type TransportKind,
} from '../app/TransportConfig'
import type { TransportConnectionStatus } from '../app/CommunicationContext'

/**
 * Inspector card that lets the user pick a `Transport` implementation
 * at runtime and shows its live connection status.
 *
 * The panel is intentionally transport-agnostic:
 *   - it emits a `TransportKind` (`none | mock | memory | rosbridge`)
 *     plus per-kind fields (today only `rosbridge` has one — the
 *     endpoint URL).
 *   - the actual `Transport` instance is built by
 *     `CommunicationProvider`. Adding a new kind (DDS, MQTT, WebRTC)
 *     means extending `TransportKind` + the `KIND_HELP` table here and
 *     teaching the provider which class to instantiate. The UI never
 *     mentions any concrete transport in any default state.
 *
 * Status semantics surfaced here are the generic
 * `TransportConnectionStatus` from `CommunicationContext` (`disabled`,
 * `disconnected`, `connecting`, `connected`, `error`) — same vocabulary
 * for every transport implementation.
 */
export function ConnectionStatusPanel() {
  const { config, status, errorMessage, setConfig } = useTransportStatus()

  // The endpoint input is intentionally uncontrolled. Editing the
  // field must NOT rebuild the transport on every keystroke (that
  // would cause a connection storm) and React's `set-state-in-effect`
  // rule discourages mirroring a prop into local state through an
  // effect. Reading the live DOM value via a ref on commit (Enter or
  // blur) gives us "draft → commit" semantics with zero extra state.
  // The `key` on the <input> below resets the field whenever
  // `config.rosbridgeUrl` changes from the outside (e.g. provider
  // hydration from env), which is exactly when an uncontrolled input
  // would normally go stale.
  const endpointInputRef = useRef<HTMLInputElement | null>(null)

  const handleKindChange = (next: TransportKind) => {
    if (next === config.kind) return
    setConfig({ ...config, kind: next })
  }

  const commitEndpoint = () => {
    const input = endpointInputRef.current
    if (!input) return
    const trimmed = input.value.trim()
    if (trimmed.length === 0) {
      // Empty input is a UX dead-end — restore whatever was active
      // and leave the config untouched. We don't fall back to
      // DEFAULT_ROSBRIDGE_URL silently because that would mask user
      // intent (they may have meant to keep the current URL).
      input.value = config.rosbridgeUrl
      return
    }
    if (trimmed === config.rosbridgeUrl) return
    setConfig({ ...config, rosbridgeUrl: trimmed })
  }

  const dotClass = `connection-status-dot connection-status-dot-${status}`
  const statusLabel = STATUS_LABELS[status]
  const helpText = KIND_HELP[config.kind]
  const showEndpoint = config.kind === 'rosbridge'

  return (
    <section className="panel connection-status-panel" aria-label="Connection">
      <h2>Connection</h2>

      <div className="connection-status-control">
        <label
          className="connection-status-control-label"
          htmlFor="connection-transport-kind"
        >
          Transport
        </label>
        <select
          id="connection-transport-kind"
          className="connection-status-select"
          value={config.kind}
          onChange={(event) =>
            handleKindChange(event.target.value as TransportKind)
          }
        >
          {KIND_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {showEndpoint && (
        <div className="connection-status-control">
          <label
            className="connection-status-control-label"
            htmlFor="connection-endpoint-url"
          >
            Endpoint URL
          </label>
          <input
            // Remount the input whenever the active URL changes from
            // outside (env hydration, programmatic setConfig). Without
            // a `key`, the uncontrolled `defaultValue` would only
            // apply on first mount and stale text would linger.
            key={config.rosbridgeUrl}
            id="connection-endpoint-url"
            ref={endpointInputRef}
            type="text"
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            className="connection-status-input"
            defaultValue={config.rosbridgeUrl}
            placeholder={DEFAULT_ROSBRIDGE_URL}
            onBlur={commitEndpoint}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitEndpoint()
              }
            }}
            aria-label="Endpoint URL"
          />
        </div>
      )}

      <div className="connection-status-row">
        <span className={dotClass} aria-hidden="true" />
        <span className="connection-status-label">{statusLabel}</span>
        {showEndpoint && (
          <code
            className="connection-status-target"
            title="Active endpoint URL"
          >
            {config.rosbridgeUrl}
          </code>
        )}
      </div>

      <p className="connection-status-hint">{helpText}</p>

      {status === 'error' && errorMessage && (
        <p className="connection-status-error" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  )
}

const KIND_OPTIONS: ReadonlyArray<{ value: TransportKind; label: string }> = [
  { value: 'none', label: 'None (disabled)' },
  { value: 'mock', label: 'Mock' },
  { value: 'memory', label: 'Memory' },
  { value: 'rosbridge', label: 'rosbridge' },
]

const STATUS_LABELS: Record<TransportConnectionStatus, string> = {
  disabled: 'Transport disabled',
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
}

// Help text is intentionally one short sentence per kind. Labels here
// are the only place where a kind-specific term may appear (e.g.
// "rosbridge_server"); everywhere else the UI talks in generic
// transport vocabulary.
const KIND_HELP: Record<TransportKind, string> = {
  none: 'Transport disabled.',
  mock: 'In-process mock transport.',
  memory: 'In-memory async transport.',
  rosbridge: 'Connects through rosbridge_server using WebSocket.',
}
