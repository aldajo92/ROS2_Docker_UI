import type { ScenarioSpec } from '../../simulation/scenarios/Scenario'

/**
 * UI-side helpers for the Scenario Editor card. Lives under
 * `src/ui/scenario/` because download requires DOM APIs (`Blob`,
 * `URL.createObjectURL`, `<a>`) that the simulation core must not
 * import. The only allowed dependency on the simulation side is the
 * `ScenarioSpec` *type* — there is no runtime coupling.
 */

export interface DownloadScenarioOptions {
  /** Base name without extension. Falls back to `"scenario"`. */
  baseName?: string
  /** Override the timestamp source for tests; defaults to `Date.now()`. */
  now?: () => number
  /** Override the file name entirely (skips timestamp/sanitization). */
  fileName?: string
}

/**
 * Pretty-print a {@link ScenarioSpec} as the canonical on-screen form
 * for the editor textarea. Two-space indent matches the bundled
 * scenario JSONs in `public/scenarios/` and stays diff-friendly.
 */
export function formatScenarioJson(spec: ScenarioSpec): string {
  return JSON.stringify(spec, null, 2)
}

/**
 * Compose the suggested file name for a downloaded scenario JSON.
 * Pure function — safe to call from any environment, including tests
 * without a DOM.
 *
 * Format: `${base}-scenario-${timestamp}.json`
 */
export function buildScenarioFileName(
  options?: DownloadScenarioOptions,
): string {
  if (options?.fileName) return options.fileName
  const rawBase = options?.baseName ?? 'scenario'
  const base = sanitizeBaseName(rawBase)
  const millis = (options?.now ?? Date.now)()
  const timestamp = compactIsoTimestamp(new Date(millis))
  return `${base}-scenario-${timestamp}.json`
}

/**
 * Trigger a browser download containing arbitrary scenario JSON text
 * (i.e. whatever is currently in the editor textarea — *not* the
 * parsed spec). The text is written verbatim so the user keeps any
 * formatting / comments they introduced before hitting Apply.
 *
 * Side-effect-only — returns `void` and logs to the console on
 * non-browser environments (matches the existing replay download
 * pattern).
 */
export function downloadScenarioJsonText(
  text: string,
  options?: DownloadScenarioOptions,
): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    console.error(
      '[scenario-editor] downloadScenarioJsonText called outside a browser environment; aborting.',
    )
    return
  }

  const fileName = buildScenarioFileName(options)
  const blob = new Blob([text], { type: 'application/json' })
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

function sanitizeBaseName(raw: string): string {
  const collapsed = raw
    .trim()
    .replaceAll(/\s+/g, '-')
    .replaceAll(/[^A-Za-z0-9._-]/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  const fallback = collapsed.length > 0 ? collapsed : 'scenario'
  return fallback.slice(0, 80)
}
