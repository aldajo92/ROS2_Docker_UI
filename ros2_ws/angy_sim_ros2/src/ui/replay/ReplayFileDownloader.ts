import type { ReplayFileFormat } from '../../simulation/recording/ReplayFormat'

/**
 * UI-side helper for saving a {@link ReplayFileFormat} to disk via a
 * Blob + anchor download.
 *
 * Architecture: this module lives under `src/ui/replay/` because it
 * needs DOM APIs (`Blob`, `URL.createObjectURL`, `<a>`). The
 * simulation core MUST NOT import from here. The only allowed
 * dependency on the simulation side is the `ReplayFileFormat` *type*
 * — there is no runtime coupling.
 */

export interface DownloadReplayOptions {
  /** Base name without extension. Falls back to `replay.scenarioName`,
   *  then to `"simulation"`. */
  baseName?: string
  /** Override the timestamp source for tests; defaults to `Date.now()`. */
  now?: () => number
}

/**
 * Compose the suggested file name. Pure function — safe to call from
 * any environment, including tests without a DOM.
 *
 * Format: `${base}-replay-${timestamp}.angy-replay.json`
 *
 * - `base` falls back through `options.baseName → replay.scenarioName
 *   → "simulation"` and is sanitized to a filesystem-friendly slug.
 * - `timestamp` is an ISO-like compact string (`YYYYMMDDTHHMMSS`)
 *   derived from `options.now() ?? Date.now()`. Compact form keeps
 *   names short while remaining sortable.
 */
export function buildReplayFileName(
  replay: ReplayFileFormat,
  options?: DownloadReplayOptions,
): string {
  const rawBase =
    options?.baseName ?? replay.scenarioName ?? 'simulation'
  const base = sanitizeBaseName(rawBase)
  const millis = (options?.now ?? Date.now)()
  const timestamp = compactIsoTimestamp(new Date(millis))
  return `${base}-replay-${timestamp}.angy-replay.json`
}

/**
 * Serialize the replay envelope to its on-disk JSON string. Pretty-
 * printed with two-space indent so files are diff-friendly without
 * blowing up size for the typical case (≤ a few thousand frames).
 */
export function serializeReplay(replay: ReplayFileFormat): string {
  return JSON.stringify(replay, null, 2)
}

/**
 * Trigger a browser download of the replay file. Side-effect-only —
 * returns `void` and logs to the console on failure (matches the
 * existing "trajectory debug export" UX in `App.tsx`).
 *
 * Implementation:
 * 1. Serialize via {@link serializeReplay}.
 * 2. Wrap in a `Blob` of type `application/json`.
 * 3. Build an off-screen `<a download>` and click it.
 * 4. Revoke the object URL immediately after the click to free
 *    memory; the click event has already been dispatched
 *    synchronously by the time we revoke.
 */
export function downloadReplay(
  replay: ReplayFileFormat,
  options?: DownloadReplayOptions,
): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    console.error(
      '[replay] downloadReplay called outside a browser environment; aborting.',
    )
    return
  }

  const fileName = buildReplayFileName(replay, options)
  const json = serializeReplay(replay)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}

/**
 * Render a `Date` as a compact, sortable, filesystem-safe timestamp.
 * Example: `2026-04-30T11:14:33` → `20260430T111433`.
 */
function compactIsoTimestamp(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `T` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  )
}

/**
 * Strip characters that browsers / filesystems handle awkwardly. Keep
 * letters, digits, hyphens, underscores, and dots; collapse runs of
 * whitespace into single hyphens; trim leading/trailing hyphens. Also
 * cap length so the final filename stays well under the 255-byte
 * limit common across modern filesystems.
 */
function sanitizeBaseName(raw: string): string {
  const collapsed = raw
    .trim()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^A-Za-z0-9._-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  const fallback = collapsed.length > 0 ? collapsed : 'simulation'
  return fallback.slice(0, 80)
}
