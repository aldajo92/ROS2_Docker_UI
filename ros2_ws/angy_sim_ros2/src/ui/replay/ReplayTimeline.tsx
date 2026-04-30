import type { ChangeEvent } from 'react'

export interface ReplayTimelineProps {
  frameCount: number
  currentIndex: number
  durationSec: number
  currentTimeSec: number
  isPlaying: boolean
  speed: number

  onSeekFrame: (index: number) => void
  onPlay: () => void
  onPause: () => void
  onStepForward: () => void
  onStepBackward: () => void
  onSpeedChange?: (speed: number) => void
  onExit: () => void
}

const SPEED_OPTIONS: readonly number[] = [0.25, 0.5, 1, 2, 4]

/**
 * Dumb / controlled replay timeline. Mirrors the rules followed by
 * {@link RecordingPanel}:
 *
 * - All state lives in the parent (`App.tsx`).
 * - The component never imports `ReplaySession`, `ReplayPlayer`, or
 *   any simulation module besides shared types.
 * - Each user gesture goes through the matching `on*` callback.
 *
 * Layout: a single horizontal strip rendered below the renderer when
 * `runMode === "replay"`. The CSS lives in the global stylesheet so
 * the component can pick up the existing inspector look without
 * pulling Phase 3 styles into a new file.
 */
export function ReplayTimeline({
  frameCount,
  currentIndex,
  durationSec,
  currentTimeSec,
  isPlaying,
  speed,
  onSeekFrame,
  onPlay,
  onPause,
  onStepForward,
  onStepBackward,
  onSpeedChange,
  onExit,
}: Readonly<ReplayTimelineProps>) {
  const max = Math.max(0, frameCount - 1)
  const sliderValue = Math.min(Math.max(0, currentIndex), max)
  const atEnd = currentIndex >= max
  const atStart = currentIndex <= 0

  const handleSlider = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.target.value)
    if (!Number.isFinite(raw)) return
    onSeekFrame(Math.floor(raw))
  }

  const handleSpeed = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = Number(event.target.value)
    if (!Number.isFinite(next) || next <= 0) return
    onSpeedChange?.(next)
  }

  const togglePlay = () => {
    if (isPlaying) onPause()
    else onPlay()
  }

  const playPauseTitle = computePlayTitle({ isPlaying, atEnd })

  return (
    <section className="panel replay-timeline" aria-label="Replay timeline">
      <div className="replay-timeline-row">
        <button
          type="button"
          className="replay-timeline-btn"
          onClick={onStepBackward}
          disabled={atStart}
          title={atStart ? 'At first frame' : 'Step backward'}
          aria-label="Step backward"
        >
          ‹
        </button>
        <button
          type="button"
          className="replay-timeline-btn replay-timeline-btn--primary"
          onClick={togglePlay}
          disabled={atEnd && !isPlaying}
          title={playPauseTitle}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="replay-timeline-btn"
          onClick={onStepForward}
          disabled={atEnd}
          title={atEnd ? 'At last frame' : 'Step forward'}
          aria-label="Step forward"
        >
          ›
        </button>

        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={sliderValue}
          onChange={handleSlider}
          aria-label="Seek frame"
          className="replay-timeline-slider"
        />

        <span
          className="replay-timeline-time"
          data-testid="replay-timeline-time"
        >
          {formatMmSs(currentTimeSec)} / {formatMmSs(durationSec)}
        </span>
        <span
          className="replay-timeline-frame"
          data-testid="replay-timeline-frame"
        >
          frame {sliderValue + 1} / {frameCount}
        </span>

        {onSpeedChange && (
          <label
            className="replay-timeline-speed"
            aria-label="Playback speed"
          >
            <span className="replay-timeline-speed-label">Speed</span>
            <select value={speed} onChange={handleSpeed}>
              {SPEED_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}x
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          className="replay-timeline-btn replay-timeline-btn--exit"
          onClick={onExit}
          title="Exit replay and return to live mode"
        >
          Exit replay
        </button>
      </div>
    </section>
  )
}

function computePlayTitle({
  isPlaying,
  atEnd,
}: {
  isPlaying: boolean
  atEnd: boolean
}): string {
  if (isPlaying) return 'Pause'
  if (atEnd) return 'At last frame'
  return 'Play'
}

/** `mm:ss.s` formatter — seconds with one decimal place. */
function formatMmSs(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0'
  const total = seconds
  const minutes = Math.floor(total / 60)
  const remaining = total - minutes * 60
  const padded = remaining < 10 ? `0${remaining.toFixed(1)}` : remaining.toFixed(1)
  return `${minutes}:${padded}`
}
