import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from './ReplayFormat'
import type { SimulationFrameSnapshot } from './SimulationFrameSnapshot'

export interface SimulationRecorderConfig {
  /**
   * Master gate. When `false`, the recorder *cannot* be started — both
   * `start()` and `append()` are no-ops. Lets the UI keep recording
   * disabled across sessions without losing the cadence parameters.
   */
  enabled: boolean
  /** Hard cap on retained frames; once reached, recording auto-stops. */
  maxFrames: number
  /** Sample one frame every N invocations of the recorder system. The
   *  recorder itself does NOT honor this — it just appends every call.
   *  The cadence is enforced by `SimulationRecorderSystem`. */
  sampleEveryNTicks: number
}

export const DEFAULT_SIMULATION_RECORDER_CONFIG: SimulationRecorderConfig = {
  enabled: false,
  maxFrames: 20000,
  sampleEveryNTicks: 1,
}

export interface SimulationRecorderStatus {
  enabled: boolean
  recording: boolean
  frameCount: number
  maxFramesReached: boolean
}

/**
 * In-memory frame buffer for simulation recording.
 *
 * Lifecycle:
 * - `start()` flips the recording flag on (only if `config.enabled`).
 * - `stop()` flips it off; existing frames are kept.
 * - `clear()` empties the buffer regardless of recording state.
 *
 * Architecture:
 * - The recorder is a pure data structure. It NEVER touches DOM APIs,
 *   timers, files, or the network.
 * - Cadence (`sampleEveryNTicks`) is the recorder system's job, not
 *   the recorder's. Calling `append` while recording always grows the
 *   buffer (unless `maxFrames` is reached).
 * - On reaching `maxFrames`, the recorder auto-stops and exposes the
 *   `maxFramesReached` flag through `getStatus()`. Subsequent
 *   `append` calls are no-ops.
 */
export class SimulationRecorder {
  private config: SimulationRecorderConfig
  private frames: SimulationFrameSnapshot[] = []
  private recording = false
  private maxFramesReached = false

  constructor(config?: Partial<SimulationRecorderConfig>) {
    this.config = sanitizeConfig({
      ...DEFAULT_SIMULATION_RECORDER_CONFIG,
      ...config,
    })
  }

  setConfig(partial: Partial<SimulationRecorderConfig>): void {
    this.config = sanitizeConfig({ ...this.config, ...partial })
    if (!this.config.enabled) this.recording = false
    if (this.frames.length < this.config.maxFrames) {
      this.maxFramesReached = false
    }
  }

  getConfig(): SimulationRecorderConfig {
    return { ...this.config }
  }

  start(): void {
    if (!this.config.enabled) return
    if (this.frames.length >= this.config.maxFrames) {
      // Already at cap from a previous run; refuse to record without
      // first being cleared.
      this.maxFramesReached = true
      return
    }
    this.recording = true
    this.maxFramesReached = false
  }

  stop(): void {
    this.recording = false
  }

  clear(): void {
    this.frames = []
    this.maxFramesReached = false
  }

  isRecording(): boolean {
    return this.recording
  }

  getStatus(): SimulationRecorderStatus {
    return {
      enabled: this.config.enabled,
      recording: this.recording,
      frameCount: this.frames.length,
      maxFramesReached: this.maxFramesReached,
    }
  }

  /**
   * Append a snapshot. No-op when not recording. When the buffer
   * reaches `maxFrames`, recording auto-stops and `maxFramesReached`
   * flips to `true`. Frames are NOT silently dropped — once at cap,
   * subsequent calls are explicit no-ops.
   */
  append(frame: SimulationFrameSnapshot): void {
    if (!this.recording) return
    if (this.frames.length >= this.config.maxFrames) {
      this.recording = false
      this.maxFramesReached = true
      return
    }
    this.frames.push(frame)
    if (this.frames.length >= this.config.maxFrames) {
      this.recording = false
      this.maxFramesReached = true
    }
  }

  getFrames(): readonly SimulationFrameSnapshot[] {
    return this.frames
  }

  /**
   * Build a serializable {@link ReplayFileFormat} envelope. Returns a
   * defensive copy of the frame array so the caller can mutate or
   * stringify it without disturbing live recorder state.
   */
  toReplayFile(params: {
    scenarioName?: string
    scenarioDescription?: string
    fixedDtSec: number
    metadata?: Record<string, unknown>
    createdAt?: string
  }): ReplayFileFormat {
    return {
      format: REPLAY_FORMAT_TAG,
      version: REPLAY_FORMAT_VERSION,
      scenarioName: params.scenarioName,
      scenarioDescription: params.scenarioDescription,
      createdAt: params.createdAt ?? new Date().toISOString(),
      fixedDtSec: params.fixedDtSec,
      metadata: params.metadata,
      frames: this.frames.map((frame) => structuredCloneFrame(frame)),
    }
  }
}

function sanitizeConfig(
  config: SimulationRecorderConfig,
): SimulationRecorderConfig {
  const maxFrames = Number.isFinite(config.maxFrames)
    ? Math.max(1, Math.floor(config.maxFrames))
    : DEFAULT_SIMULATION_RECORDER_CONFIG.maxFrames
  const sampleEveryNTicks = Number.isFinite(config.sampleEveryNTicks)
    ? Math.max(1, Math.floor(config.sampleEveryNTicks))
    : DEFAULT_SIMULATION_RECORDER_CONFIG.sampleEveryNTicks
  return {
    enabled: !!config.enabled,
    maxFrames,
    sampleEveryNTicks,
  }
}

/**
 * Defensive-clone a frame so callers cannot mutate the recorder's
 * internal arrays through the returned `ReplayFileFormat`.
 * `structuredClone` is required (Node ≥17, modern browsers) — the
 * frame shape is JSON-only by contract, which is a strict subset of
 * the structured-clone algorithm's domain.
 */
function structuredCloneFrame(
  frame: SimulationFrameSnapshot,
): SimulationFrameSnapshot {
  return structuredClone(frame)
}
