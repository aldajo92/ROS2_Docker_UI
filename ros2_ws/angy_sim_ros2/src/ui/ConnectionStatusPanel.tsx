import { useTransportStatus } from '../app/useTransportStatus'

/**
 * Inspector card showing the live transport status:
 *   - `disabled`     — VITE_TRANSPORT_KIND is `none` / unset.
 *   - `disconnected` — wired but no connection attempted yet (or closed).
 *   - `connecting`   — connect() in flight.
 *   - `connected`    — handshake complete, publishes & subscribes flowing.
 *   - `error`        — connect() rejected or the socket emitted an error.
 *
 * Read-only: the panel never mutates the transport. The wiring lives
 * in `CommunicationProvider`; this component is a dumb consumer.
 */
export function ConnectionStatusPanel() {
  const { config, status, errorMessage } = useTransportStatus()

  const dotClass = `connection-status-dot connection-status-dot-${status}`
  const label = STATUS_LABELS[status]
  const target =
    config.kind === 'rosbridge'
      ? config.rosbridgeUrl
      : config.kind === 'none'
        ? '—'
        : `(${config.kind})`

  return (
    <section className="panel connection-status-panel" aria-label="Connection">
      <h2>Connection</h2>
      <div className="connection-status-row">
        <span className={dotClass} aria-hidden="true" />
        <span className="connection-status-label">{label}</span>
        <code className="connection-status-target" title="Transport target">
          {target}
        </code>
      </div>
      <div className="connection-status-meta">
        <span>Transport:</span>
        <code>{config.kind}</code>
      </div>
      {status === 'error' && errorMessage && (
        <p className="connection-status-error" role="alert">
          {errorMessage}
        </p>
      )}
      {status === 'disabled' && (
        <p className="connection-status-hint">
          Set <code>VITE_TRANSPORT_KIND=rosbridge</code> in your{' '}
          <code>.env</code> (and{' '}
          <code>VITE_ROSBRIDGE_URL=ws://localhost:9090</code>) to enable
          rosbridge.
        </p>
      )}
    </section>
  )
}

const STATUS_LABELS: Record<
  ReturnType<typeof useTransportStatus>['status'],
  string
> = {
  disabled: 'Transport disabled',
  disconnected: 'Disconnected',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Error',
}
