import { formatEchoMessage, type TopicEchoSession } from '../app/TopicEcho'

/**
 * Inspector card for a single live topic-echo session. Renders the
 * topic metadata, status, the latest received message as JSON, and
 * Stop/Resume/Close controls. Pure UI: every action delegates to the
 * generic `topicEcho` capability through the parent.
 *
 * `session.status` drives which buttons are visible:
 *   - `listening` → Stop Echo + Close
 *   - `stopped`   → Resume Echo (if the connection is still alive)
 *                   + Close
 *   - `error`     → Close (and an error banner)
 */
export interface EchoCardProps {
  session: TopicEchoSession
  /**
   * `true` when the underlying transport is still up. Used to gate
   * the Resume button — there's no point letting the user resume a
   * stopped session against a closed socket.
   */
  canResume?: boolean
  onStop: (topicName: string) => void
  onResume: (topicName: string) => void
  onClose: (topicName: string) => void
}

const STATUS_LABEL: Record<TopicEchoSession['status'], string> = {
  listening: 'listening',
  stopped: 'stopped',
  error: 'error',
}

export function EchoCard({
  session,
  canResume = true,
  onStop,
  onResume,
  onClose,
}: Readonly<EchoCardProps>) {
  const hasMessage = session.latestMessage !== undefined
  const formattedMessage = hasMessage
    ? formatEchoMessage(session.latestMessage)
    : ''

  return (
    <section
      className="panel echo-card"
      aria-label={`Topic echo: ${session.topicName}`}
      data-testid="echo-card"
    >
      <div className="echo-card-header">
        {/*
          The card title is intentionally generic ("Topic echo") so
          stacking multiple echo cards reads cleanly. The actual
          topic name lives in the metadata `<dl>` below as the
          "Name" row, which keeps it visually grouped with Type and
          Status. Screen readers still get the topic via the
          section's `aria-label`.
        */}
        <h2 className="echo-card-title">Topic echo</h2>
        <button
          type="button"
          className="echo-card-close"
          onClick={() => onClose(session.topicName)}
          data-testid="echo-card-close"
          aria-label={`Close echo card for ${session.topicName}`}
          title={`Close echo card for ${session.topicName}`}
        >
          {/* The visible glyph is decorative — assistive tech reads
              the aria-label / title instead. We use the same icon
              pattern as the Ros2TopicsPanel expand button so the
              inspector chrome stays consistent. */}
          <span aria-hidden="true">{'\u00d7'}</span>
        </button>
      </div>

      {/*
        Stop / Resume live on their own row below the title. The
        header above is reserved for the topic name + the close icon
        (mirroring the convention from `ScenarioEditorPanel`'s expand
        button). For an `error` session there is no primary action
        and the row is suppressed entirely so it doesn't render an
        empty band.
      */}
      {(session.status === 'listening' || session.status === 'stopped') && (
        <div className="echo-card-actions">
          {session.status === 'listening' && (
            <button
              type="button"
              className="echo-card-stop"
              onClick={() => onStop(session.topicName)}
              data-testid="echo-card-stop"
            >
              Stop Echo
            </button>
          )}
          {session.status === 'stopped' && (
            <button
              type="button"
              className="echo-card-resume"
              onClick={() => onResume(session.topicName)}
              disabled={!canResume}
              title={
                canResume
                  ? `Resume echo of ${session.topicName}`
                  : 'Reconnect to resume'
              }
              data-testid="echo-card-resume"
            >
              Resume Echo
            </button>
          )}
        </div>
      )}

      <dl className="echo-card-meta">
        <dt>Name</dt>
        <dd data-testid="echo-card-name">
          <code>{session.topicName}</code>
        </dd>
        {session.topicType && (
          <>
            <dt>Type</dt>
            <dd>
              <code>{session.topicType}</code>
            </dd>
          </>
        )}
        <dt>Status</dt>
        <dd
          className={`echo-card-status echo-card-status-${session.status}`}
          data-testid="echo-card-status"
        >
          {STATUS_LABEL[session.status]}
        </dd>
      </dl>

      {session.error && (
        <p className="echo-card-error" role="alert">
          {session.error}
        </p>
      )}

      {hasMessage ? (
        <pre className="echo-card-message" data-testid="echo-card-message">
          {formattedMessage}
        </pre>
      ) : (
        <p
          className="echo-card-waiting"
          data-testid="echo-card-waiting"
        >
          Waiting for messages...
        </p>
      )}
    </section>
  )
}
