import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from '../../simulation/recording/ReplayFormat'

/**
 * Discriminated result type so the caller never has to write
 * `try/catch` around the parser. A `false` discriminant always
 * carries a user-facing `error` string; a `true` discriminant always
 * carries the validated `replay` object.
 */
export type LoadReplayResult =
  | { ok: true; replay: ReplayFileFormat }
  | { ok: false; error: string }

/**
 * Reads a `.json` / `.angy-replay.json` file from a `<input type="file">`
 * change event, decodes it as UTF-8, and routes the contents through
 * {@link parseReplayJson}.
 *
 * Browser-only entry point — uses `File.text()`. Pure JSON validation
 * lives in {@link parseReplayJson} and is unit-testable without a DOM.
 */
export async function readReplayFromFile(
  file: File,
): Promise<LoadReplayResult> {
  if (!file) {
    return { ok: false, error: 'No file provided.' }
  }
  try {
    const text = await file.text()
    return parseReplayJson(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to read file: ${message}` }
  }
}

/**
 * Pure parser/validator. Returns descriptive errors instead of
 * throwing so the UI can surface them with a toast / `console.error`.
 *
 * Validation policy:
 * - `JSON.parse` failures → "Invalid JSON: …"
 * - missing/wrong `format` → format mismatch
 * - missing/unsupported `version` → version error
 * - `fixedDtSec` not a positive finite number → schema error
 * - `frames` not an array, or empty → schema error
 * - any frame fails `Number.isFinite(tick)`, `Number.isFinite(timeSec)`,
 *   or `Array.isArray(entities)` → first failure short-circuits with a
 *   helpful message including the frame index.
 */
export function parseReplayJson(text: string): LoadReplayResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Invalid JSON: ${message}` }
  }

  if (!isObject(parsed)) {
    return { ok: false, error: 'Replay root must be a JSON object.' }
  }

  const formatErr = validateFormatTag(parsed)
  if (formatErr) return formatErr

  const versionErr = validateVersion(parsed)
  if (versionErr) return versionErr

  const dtErr = validateFixedDt(parsed)
  if (dtErr) return dtErr

  const framesErr = validateFrames(parsed)
  if (framesErr) return framesErr

  return { ok: true, replay: parsed as unknown as ReplayFileFormat }
}

function validateFormatTag(parsed: Record<string, unknown>): LoadReplayResult | null {
  if (parsed.format !== REPLAY_FORMAT_TAG) {
    return {
      ok: false,
      error: `Unrecognized replay format: expected "${REPLAY_FORMAT_TAG}", got ${describe(parsed.format)}.`,
    }
  }
  return null
}

function validateVersion(parsed: Record<string, unknown>): LoadReplayResult | null {
  if (parsed.version !== REPLAY_FORMAT_VERSION) {
    return {
      ok: false,
      error: `Unsupported replay version: expected ${REPLAY_FORMAT_VERSION}, got ${describe(parsed.version)}.`,
    }
  }
  return null
}

function validateFixedDt(parsed: Record<string, unknown>): LoadReplayResult | null {
  const dt = parsed.fixedDtSec
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
    return {
      ok: false,
      error: `Replay "fixedDtSec" must be a positive number; got ${describe(dt)}.`,
    }
  }
  return null
}

function validateFrames(parsed: Record<string, unknown>): LoadReplayResult | null {
  const frames = parsed.frames
  if (!Array.isArray(frames)) {
    return {
      ok: false,
      error: 'Replay "frames" must be an array.',
    }
  }
  if (frames.length === 0) {
    return {
      ok: false,
      error: 'Replay contains no frames.',
    }
  }
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i]
    const frameErr = validateFrame(frame, i)
    if (frameErr) return frameErr
  }
  return null
}

function validateFrame(frame: unknown, index: number): LoadReplayResult | null {
  if (!isObject(frame)) {
    return {
      ok: false,
      error: `Frame ${index} must be an object.`,
    }
  }
  if (typeof frame.tick !== 'number' || !Number.isFinite(frame.tick)) {
    return {
      ok: false,
      error: `Frame ${index} has non-finite "tick".`,
    }
  }
  if (typeof frame.timeSec !== 'number' || !Number.isFinite(frame.timeSec)) {
    return {
      ok: false,
      error: `Frame ${index} has non-finite "timeSec".`,
    }
  }
  if (!Array.isArray(frame.entities)) {
    return {
      ok: false,
      error: `Frame ${index} "entities" must be an array.`,
    }
  }
  return null
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return typeof value
}
