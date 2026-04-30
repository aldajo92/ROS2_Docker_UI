// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createRef, type RefObject } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { LayoutSplitter } from './LayoutSplitter'
import { MIN_INSPECTOR_WIDTH_PX } from './clampInspectorWidth'

interface Harness {
  container: HTMLDivElement
  root: Root
}

const mount = (ui: React.ReactNode): Harness => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, root }
}

const unmount = (harness: Harness | null) => {
  if (!harness) return
  act(() => {
    harness.root.unmount()
  })
  harness.container.remove()
}

/**
 * happy-dom doesn't implement layout, so `getBoundingClientRect()` on
 * a detached element returns zeroes. We stub it directly so the
 * splitter sees a realistic layout rect during tests.
 */
const makeLayoutRef = (
  widthPx: number,
  rightPx = widthPx,
): RefObject<HTMLDivElement | null> => {
  const ref = createRef<HTMLDivElement>()
  const fakeEl = {
    getBoundingClientRect: () => ({
      width: widthPx,
      height: 800,
      top: 0,
      bottom: 800,
      left: rightPx - widthPx,
      right: rightPx,
      x: rightPx - widthPx,
      y: 0,
      toJSON() {
        return this
      },
    }),
  } as unknown as HTMLDivElement
  ;(ref as { current: HTMLDivElement | null }).current = fakeEl
  return ref
}

describe('LayoutSplitter', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
    document.body.classList.remove('layout-splitter-dragging')
  })

  it('renders a vertical separator with ARIA metadata', () => {
    const layoutRef = makeLayoutRef(1600)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={420}
        onInspectorWidthChange={() => {}}
        layoutRef={layoutRef}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    expect(sep).not.toBeNull()
    expect(sep.getAttribute('role')).toBe('separator')
    expect(sep.getAttribute('aria-orientation')).toBe('vertical')
    expect(sep.getAttribute('aria-valuenow')).toBe('420')
    expect(sep.getAttribute('aria-valuemin')).toBe(
      String(MIN_INSPECTOR_WIDTH_PX),
    )
    expect(sep.tabIndex).toBe(0)
  })

  it('rounds aria-valuenow so screen readers don\u2019t announce sub-pixel decimals', () => {
    const layoutRef = makeLayoutRef(1600)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={420.6}
        onInspectorWidthChange={() => {}}
        layoutRef={layoutRef}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    expect(sep.getAttribute('aria-valuenow')).toBe('421')
  })

  it('nudges inspector wider on ArrowLeft (clamped through the helper)', () => {
    const onChange = vi.fn()
    const layoutRef = makeLayoutRef(1600)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={500}
        onInspectorWidthChange={onChange}
        layoutRef={layoutRef}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    act(() => {
      sep.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      )
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(516)
  })

  it('nudges inspector narrower on ArrowRight, never below the minimum', () => {
    const onChange = vi.fn()
    const layoutRef = makeLayoutRef(1600)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={MIN_INSPECTOR_WIDTH_PX}
        onInspectorWidthChange={onChange}
        layoutRef={layoutRef}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    act(() => {
      sep.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })
    expect(onChange).toHaveBeenCalledWith(MIN_INSPECTOR_WIDTH_PX)
  })

  it('snaps to the minimum on Home', () => {
    const onChange = vi.fn()
    const layoutRef = makeLayoutRef(1600)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={900}
        onInspectorWidthChange={onChange}
        layoutRef={layoutRef}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    act(() => {
      sep.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      )
    })
    expect(onChange).toHaveBeenCalledWith(MIN_INSPECTOR_WIDTH_PX)
  })

  it('ignores keys it does not handle', () => {
    const onChange = vi.fn()
    const layoutRef = makeLayoutRef(1600)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={500}
        onInspectorWidthChange={onChange}
        layoutRef={layoutRef}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    act(() => {
      sep.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
      )
      sep.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('respects custom min/max overrides for keyboard nudges', () => {
    const onChange = vi.fn()
    const layoutRef = makeLayoutRef(1000)
    harness = mount(
      <LayoutSplitter
        inspectorWidthPx={400}
        onInspectorWidthChange={onChange}
        layoutRef={layoutRef}
        minInspector={300}
        minViewport={200}
      />,
    )
    const sep = harness.container.querySelector(
      '[data-testid="layout-splitter"]',
    ) as HTMLDivElement
    // Try to shrink the inspector below the override minimum.
    act(() => {
      ;(sep as unknown as HTMLElement).focus()
      sep.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Home', bubbles: true }),
      )
    })
    expect(onChange).toHaveBeenLastCalledWith(300)
  })
})
