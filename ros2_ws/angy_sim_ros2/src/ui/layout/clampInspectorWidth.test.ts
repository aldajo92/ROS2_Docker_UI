import { describe, expect, it } from 'vitest'
import {
  LAYOUT_GAP_PX,
  MIN_INSPECTOR_WIDTH_PX,
  MIN_VIEWPORT_WIDTH_PX,
  SPLITTER_WIDTH_PX,
  clampInspectorWidth,
} from './clampInspectorWidth'

const RESERVED =
  MIN_VIEWPORT_WIDTH_PX + SPLITTER_WIDTH_PX + 2 * LAYOUT_GAP_PX

describe('clampInspectorWidth', () => {
  it('returns the candidate verbatim inside the legal range', () => {
    const layoutWidth = 1600
    const candidate = 500
    expect(clampInspectorWidth(candidate, layoutWidth)).toBe(500)
  })

  it('clamps to the inspector minimum when the candidate is too small', () => {
    expect(clampInspectorWidth(120, 1600)).toBe(MIN_INSPECTOR_WIDTH_PX)
    expect(clampInspectorWidth(0, 1600)).toBe(MIN_INSPECTOR_WIDTH_PX)
    expect(clampInspectorWidth(-50, 1600)).toBe(MIN_INSPECTOR_WIDTH_PX)
  })

  it('caps the inspector so the viewport keeps its minimum width', () => {
    const layoutWidth = 1600
    const upperBound = layoutWidth - RESERVED
    // Candidate above the cap → clamped to cap.
    expect(clampInspectorWidth(layoutWidth, layoutWidth)).toBe(upperBound)
    expect(clampInspectorWidth(upperBound + 50, layoutWidth)).toBe(upperBound)
    // Candidate exactly at cap → preserved.
    expect(clampInspectorWidth(upperBound, layoutWidth)).toBe(upperBound)
  })

  it('falls back to the inspector minimum when the layout is pathologically narrow', () => {
    // Layout barely fits the inspector: the upper bound would be
    // negative, but `Math.max(minInspector, ...)` keeps us safe.
    const tinyLayout = 200
    expect(clampInspectorWidth(500, tinyLayout)).toBe(MIN_INSPECTOR_WIDTH_PX)
    expect(clampInspectorWidth(0, tinyLayout)).toBe(MIN_INSPECTOR_WIDTH_PX)
  })

  it('honors custom minimums for testability', () => {
    expect(
      clampInspectorWidth(100, 1000, {
        minInspector: 200,
        minViewport: 300,
        splitterWidth: 4,
        gapPx: 0,
      }),
    ).toBe(200)
    // Upper bound: 1000 - (300 + 4 + 0) = 696
    expect(
      clampInspectorWidth(900, 1000, {
        minInspector: 200,
        minViewport: 300,
        splitterWidth: 4,
        gapPx: 0,
      }),
    ).toBe(696)
  })

  it('returns the inspector minimum when given NaN', () => {
    expect(clampInspectorWidth(Number.NaN, 1600)).toBe(MIN_INSPECTOR_WIDTH_PX)
  })

  it('integrates the dragging convention: rect.right - clientX', () => {
    // Simulate a 1600px-wide layout sitting at x=50..1650 with the
    // pointer dropping at clientX=1100 → desired inspector = 550.
    const layoutWidth = 1600
    const layoutRight = 1650
    const clientX = 1100
    const desired = layoutRight - clientX
    expect(clampInspectorWidth(desired, layoutWidth)).toBe(550)
  })

  it('caps at the upper bound when the user tries to shrink the viewport below its minimum', () => {
    const layoutWidth = 1200
    const upperBound = layoutWidth - RESERVED
    // Pointer drag yielding `desired = 1000` would leave the viewport
    // narrower than `MIN_VIEWPORT_WIDTH_PX`.
    expect(clampInspectorWidth(1000, layoutWidth)).toBe(upperBound)
  })
})
