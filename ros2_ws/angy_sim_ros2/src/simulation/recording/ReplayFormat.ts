import type { SimulationFrameSnapshot } from './SimulationFrameSnapshot'

/**
 * Versioned replay envelope. Produced by `SimulationRecorder.toReplayFile`
 * and consumed (in Phase 3) by `ReplayFileLoader` / `ReplaySession`.
 *
 * The shape is intentionally JSON-only: any field reachable from this
 * type must be safely serializable via `JSON.stringify`. Do NOT add
 * class instances, functions, or Maps/Sets — replay files are written
 * to disk in Phase 2 and parsed back from disk in Phase 3.
 */
export interface ReplayFileFormat {
  format: 'angy_sim_replay'
  version: 1
  scenarioName?: string
  scenarioDescription?: string
  /** ISO 8601 wall-clock at the moment of export. Optional metadata. */
  createdAt?: string
  /** The engine's fixed dt at export time, used by the player to pace
   *  playback. */
  fixedDtSec: number
  metadata?: Record<string, unknown>
  frames: SimulationFrameSnapshot[]
}

/** Sentinel string used by `ReplayFileLoader` (Phase 3) to validate
 *  that an arbitrary JSON file is in fact an `angy_sim_replay`. */
export const REPLAY_FORMAT_TAG = 'angy_sim_replay' as const

/** Schema version. Bump whenever the on-disk shape gains breaking
 *  changes; the loader rejects unsupported versions. */
export const REPLAY_FORMAT_VERSION = 1 as const
