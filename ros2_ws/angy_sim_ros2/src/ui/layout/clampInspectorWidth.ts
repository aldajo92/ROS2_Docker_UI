/**
 * Layout splitter math — extracted into a pure module so it stays
 * testable without a DOM. The visual splitter and the App-level
 * window-resize handler both call into this clamp so the inspector
 * never escapes its allowed range.
 *
 * Coordinate convention:
 * - `candidatePx` is the *desired* inspector width derived from the
 *   pointer position, e.g. `layoutRect.right - event.clientX`.
 * - `layoutWidthPx` is the width of `.layout` as measured by
 *   `getBoundingClientRect()`.
 *
 * Architecture: this file lives in `src/ui/layout/` because the math
 * is purely a UI concern. The simulation core MUST NOT import from
 * here — there is no domain coupling.
 */

/** Smallest inspector column width the user is allowed to shrink to.
 *  Matches the previous fixed `min(380px, 36vw)` so existing inspector
 *  panels (Scenario Editor textarea, Recording panel, etc.) still
 *  render without overflow. */
export const MIN_INSPECTOR_WIDTH_PX = 380

/** Smallest viewport width before we refuse to shrink it further.
 *  Picked so the simulation canvas, replay timeline, and viewport
 *  header (camera indicator + key hints) remain legible. */
export const MIN_VIEWPORT_WIDTH_PX = 640

/** Visible width of the splitter column inside the 3-column grid.
 *  Kept in sync with the `--splitter-width` CSS custom property in
 *  `app.css`. Exported here so tests don't need to read CSS. */
export const SPLITTER_WIDTH_PX = 6

/** Horizontal gap between adjacent grid columns. Mirrors `gap` on
 *  `.layout` in `app.css`. */
export const LAYOUT_GAP_PX = 12

export interface ClampInspectorWidthOptions {
  minInspector?: number
  minViewport?: number
  splitterWidth?: number
  gapPx?: number
}

/**
 * Clamp a candidate inspector width into the legal range, given the
 * current layout width.
 *
 * Rules (in order of precedence):
 * 1. The inspector cannot be narrower than `minInspector`.
 * 2. The viewport cannot be narrower than `minViewport`. The
 *    inspector therefore cannot exceed
 *    `layoutWidth - splitterWidth - 2 * gap - minViewport`.
 * 3. If the layout itself is too narrow to satisfy both minimums,
 *    the lower bound wins (we never report a value below
 *    `minInspector`). The viewport will overflow horizontally in
 *    that pathological case, but that is preferable to silently
 *    collapsing the inspector to nothing.
 */
export function clampInspectorWidth(
  candidatePx: number,
  layoutWidthPx: number,
  options?: ClampInspectorWidthOptions,
): number {
  const minInspector = options?.minInspector ?? MIN_INSPECTOR_WIDTH_PX
  const minViewport = options?.minViewport ?? MIN_VIEWPORT_WIDTH_PX
  const splitterWidth = options?.splitterWidth ?? SPLITTER_WIDTH_PX
  const gapPx = options?.gapPx ?? LAYOUT_GAP_PX

  const reserved = minViewport + splitterWidth + 2 * gapPx
  const upperBound = Math.max(minInspector, layoutWidthPx - reserved)

  if (Number.isNaN(candidatePx)) return minInspector
  return Math.max(minInspector, Math.min(upperBound, candidatePx))
}
