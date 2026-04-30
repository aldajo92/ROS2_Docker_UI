import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import {
  MIN_INSPECTOR_WIDTH_PX,
  MIN_VIEWPORT_WIDTH_PX,
  clampInspectorWidth,
} from './clampInspectorWidth'

const KEYBOARD_STEP_PX = 16
const DRAG_BODY_CLASS = 'layout-splitter-dragging'

export interface LayoutSplitterProps {
  /** Current inspector width in pixels. Used as the source of truth
   *  for keyboard nudges and as the `aria-valuenow` value. */
  inspectorWidthPx: number
  /** Notified with the next clamped inspector width on every pointer
   *  move and on every keyboard nudge. */
  onInspectorWidthChange: (next: number) => void
  /** Ref to the `.layout` element. Used to compute the candidate
   *  width from `layoutRect.right - event.clientX`. */
  layoutRef: RefObject<HTMLDivElement | null>
  /** Optional override of the lower bound. Defaults to
   *  {@link MIN_INSPECTOR_WIDTH_PX}. */
  minInspector?: number
  /** Optional override of the implicit upper bound. Defaults to
   *  {@link MIN_VIEWPORT_WIDTH_PX}. */
  minViewport?: number
}

/**
 * Vertical drag handle that sits between `.layout-left` and
 * `.layout-right`. Pointer events use {@link Element.setPointerCapture}
 * so we don't have to attach `pointermove`/`pointerup` listeners on
 * the document — the captured pointer routes back to the splitter
 * even when the cursor leaves the element.
 *
 * Accessibility: the splitter is a native `role="separator"` with
 * `aria-orientation="vertical"`; ArrowLeft/ArrowRight nudge the
 * inspector width by {@link KEYBOARD_STEP_PX} so keyboard users can
 * resize without a pointing device.
 */
export function LayoutSplitter({
  inspectorWidthPx,
  onInspectorWidthChange,
  layoutRef,
  minInspector = MIN_INSPECTOR_WIDTH_PX,
  minViewport = MIN_VIEWPORT_WIDTH_PX,
}: Readonly<LayoutSplitterProps>) {
  const draggingRef = useRef(false)

  const applyCandidate = (candidate: number) => {
    const layoutWidth =
      layoutRef.current?.getBoundingClientRect().width ?? 0
    const next = clampInspectorWidth(candidate, layoutWidth, {
      minInspector,
      minViewport,
    })
    onInspectorWidthChange(next)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Ignore non-primary buttons so right-click / middle-click don't
    // accidentally start a drag (matches the WAI-ARIA Authoring
    // Practices for window splitters).
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    draggingRef.current = true
    if (typeof document !== 'undefined') {
      document.body.classList.add(DRAG_BODY_CLASS)
    }
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    const layout = layoutRef.current
    if (!layout) return
    const rect = layout.getBoundingClientRect()
    applyCandidate(rect.right - event.clientX)
  }

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (typeof document !== 'undefined') {
      document.body.classList.remove(DRAG_BODY_CLASS)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Convention: ArrowLeft = "make the right column wider", which
    // matches the visual cue (the splitter moves left).
    if (event.key === 'ArrowLeft') {
      applyCandidate(inspectorWidthPx + KEYBOARD_STEP_PX)
      event.preventDefault()
      return
    }
    if (event.key === 'ArrowRight') {
      applyCandidate(inspectorWidthPx - KEYBOARD_STEP_PX)
      event.preventDefault()
      return
    }
    if (event.key === 'Home') {
      applyCandidate(minInspector)
      event.preventDefault()
    }
  }

  return (
    <div
      className="layout-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize inspector"
      aria-valuenow={Math.round(inspectorWidthPx)}
      aria-valuemin={minInspector}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      data-testid="layout-splitter"
    >
      <div className="layout-splitter-handle" aria-hidden="true" />
    </div>
  )
}
