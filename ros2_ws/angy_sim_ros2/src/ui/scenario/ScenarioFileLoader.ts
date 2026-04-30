import {
  ScenarioLoader,
  ScenarioParseError,
} from '../../simulation/scenarios/ScenarioLoader'
import type { ScenarioSpec } from '../../simulation/scenarios/Scenario'

/**
 * Discriminated result type so the caller never has to write
 * `try/catch` around the parser. A `false` discriminant always
 * carries a user-facing `error` string; a `true` discriminant always
 * carries the validated `spec`.
 */
export type LoadScenarioResult =
  | { ok: true; spec: ScenarioSpec }
  | { ok: false; error: string }

/**
 * Sentinel used by replay files. Imported as a string literal — the
 * scenario loader does NOT depend on replay internals (no type imports
 * from `recording/`); it only needs to recognise the tag at runtime so
 * the user gets a precise error if they pick the wrong file.
 */
const REPLAY_FORMAT_TAG = 'angy_sim_replay' as const

/**
 * Reads a `.json` scenario file from a `<input type="file">` change
 * event, decodes it as UTF-8, and routes the contents through
 * {@link parseScenarioJson}.
 *
 * Browser-only entry point — uses `File.text()`. Pure JSON validation
 * lives in {@link parseScenarioJson} and is unit-testable without a
 * DOM.
 */
export async function readScenarioFromFile(
  file: File,
): Promise<LoadScenarioResult> {
  if (!file) {
    return { ok: false, error: 'No file provided.' }
  }
  try {
    const text = await file.text()
    return parseScenarioJson(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to read file: ${message}` }
  }
}

/**
 * Pure parser/validator. Returns descriptive errors instead of
 * throwing so the UI can surface them with a toast / inline message.
 *
 * Validation policy:
 * - `JSON.parse` failures → `Invalid JSON: …`.
 * - Replay file detected (`format === "angy_sim_replay"`) → explicit
 *   "this is a replay file" rejection so the user understands which
 *   uploader they should have used.
 * - Anything else is delegated to `ScenarioLoader.parse` so the
 *   bundled-scenario flow and the upload flow share the same
 *   validation rules.
 */
export function parseScenarioJson(text: string): LoadScenarioResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Invalid JSON: ${message}` }
  }

  if (isReplayFile(parsed)) {
    return {
      ok: false,
      error: 'This is a replay file, not a scenario file.',
    }
  }

  try {
    const spec = ScenarioLoader.parse(parsed)
    return { ok: true, spec }
  } catch (err) {
    if (err instanceof ScenarioParseError) {
      return { ok: false, error: err.message }
    }
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to parse scenario: ${message}` }
  }
}

function isReplayFile(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).format === REPLAY_FORMAT_TAG
  )
}
