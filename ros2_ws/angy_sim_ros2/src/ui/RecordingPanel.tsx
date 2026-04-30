import type { ChangeEvent } from 'react'
import type {
  SimulationRecorderConfig,
  SimulationRecorderStatus,
} from '../simulation/recording/SimulationRecorder'

export interface RecordingPanelProps {
  status: SimulationRecorderStatus
  config: SimulationRecorderConfig
  onConfigChange: (config: Partial<SimulationRecorderConfig>) => void
  onStart: () => void
  onStop: () => void
  onClear: () => void
  onDownload: () => void
  /**
   * Set to a non-empty string once Phase 3 introduces replay mode.
   * The panel disables Start/Stop/Clear/Download with a tooltip
   * explaining that recording is paused while replaying.
   */
  disabledReason?: string
}

/**
 * Inspector "Recording" panel — a **dumb / controlled** component.
 *
 * Architecture rules:
 * - All state lives in the parent (`App.tsx`).
 * - The panel calls only the four `on*` callbacks. It NEVER imports
 *   `SimulationController`, `SimulationRecorder`, or any DOM / file
 *   APIs. The parent decides what `onDownload` means.
 * - The visual style mirrors `RendererSettingsPanel` (`.panel`,
 *   `.renderer-settings-*`).
 */
export function RecordingPanel({
  status,
  config,
  onConfigChange,
  onStart,
  onStop,
  onClear,
  onDownload,
  disabledReason,
}: Readonly<RecordingPanelProps>) {
  const isReplayDisabled = !!disabledReason && disabledReason.length > 0
  const idle = !status.recording
  const hasFrames = status.frameCount > 0

  const startDisabled = isReplayDisabled || status.recording
  const stopDisabled = isReplayDisabled || idle
  const clearDisabled = isReplayDisabled || !hasFrames
  const downloadDisabled = isReplayDisabled || !hasFrames

  const onSampleEvery = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const parsed = raw === '' ? Number.NaN : Number(raw)
    if (!Number.isFinite(parsed)) return
    onConfigChange({ sampleEveryNTicks: Math.max(1, Math.floor(parsed)) })
  }

  const onMaxFrames = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    const parsed = raw === '' ? Number.NaN : Number(raw)
    if (!Number.isFinite(parsed)) return
    onConfigChange({ maxFrames: Math.max(100, Math.floor(parsed)) })
  }

  const startTitle = computeButtonTitle({
    disabledReason,
    fallback: status.recording ? 'Already recording' : undefined,
  })
  const stopTitle = computeButtonTitle({
    disabledReason,
    fallback: idle ? 'Not currently recording' : undefined,
  })
  const clearTitle = computeButtonTitle({
    disabledReason,
    fallback: hasFrames ? undefined : 'No frames to clear',
  })
  const downloadTitle = computeButtonTitle({
    disabledReason,
    fallback: hasFrames ? undefined : 'No frames to download',
  })

  return (
    <section
      className="panel renderer-settings"
      aria-label="Recording"
      title={isReplayDisabled ? disabledReason : undefined}
    >
      <h2>Recording</h2>
      <p className="renderer-settings-hint">
        Capture the running simulation tick-by-tick into an in-memory
        buffer. Use <strong>Download</strong> to save it as a replay
        file. Loading and playback arrive in a later phase.
      </p>

      <div className="renderer-settings-grid">
        <div
          className="renderer-settings-row"
          aria-label="Recording status"
        >
          <span>Status</span>
          <span className="renderer-settings-value">
            {status.recording ? 'Recording' : 'Idle'}
            {status.maxFramesReached && (
              <>
                {' '}
                <span
                  className="renderer-settings-hint"
                  data-testid="max-frames-warning"
                >
                  · max frames reached
                </span>
              </>
            )}
          </span>
        </div>

        <div className="renderer-settings-row">
          <span>Frames captured</span>
          <span
            className="renderer-settings-value"
            data-testid="frame-count"
          >
            {status.frameCount}
            {' / '}
            {config.maxFrames}
          </span>
        </div>

        <label className="renderer-settings-row renderer-settings-row--checkbox">
          <input
            type="checkbox"
            checked={!!config.enabled}
            onChange={(e) => onConfigChange({ enabled: e.target.checked })}
            disabled={isReplayDisabled}
          />
          <span>
            Enable recording{' '}
            <span className="renderer-settings-hint">
              · enabling alone does not start; use Start below
            </span>
          </span>
        </label>

        <label className="renderer-settings-row">
          <span>Sample every N ticks</span>
          <input
            type="number"
            min={1}
            step={1}
            value={config.sampleEveryNTicks}
            onChange={onSampleEvery}
            disabled={isReplayDisabled}
          />
        </label>

        <label className="renderer-settings-row">
          <span>Max frames</span>
          <input
            type="number"
            min={100}
            step={100}
            value={config.maxFrames}
            onChange={onMaxFrames}
            disabled={isReplayDisabled}
          />
        </label>
      </div>

      <p className="renderer-settings-hint">
        Configuration changes mid-recording take effect on the next
        tick.
      </p>

      <div className="renderer-settings-actions">
        <button
          type="button"
          onClick={onStart}
          disabled={startDisabled}
          title={startTitle}
        >
          Start recording
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={stopDisabled}
          title={stopTitle}
        >
          Stop recording
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={clearDisabled}
          title={clearTitle}
        >
          Clear recording
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={downloadDisabled}
          title={downloadTitle}
        >
          Download recording
        </button>
      </div>
    </section>
  )
}

function computeButtonTitle({
  disabledReason,
  fallback,
}: {
  disabledReason?: string
  fallback?: string
}): string | undefined {
  if (disabledReason && disabledReason.length > 0) return disabledReason
  return fallback
}
