// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { DebugOverlayPanel } from './DebugOverlayPanel'
import type { DebugOverlayConfig } from './renderers/debug/DebugOverlayConfig'

interface Harness {
  container: HTMLDivElement
  root: Root
}

function mount(ui: React.ReactNode): Harness {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, root }
}

function unmount(h: Harness | null): void {
  if (!h) return
  act(() => {
    h.root.unmount()
  })
  h.container.remove()
}

function baseConfig(
  overrides: Partial<DebugOverlayConfig> = {},
): DebugOverlayConfig {
  return {
    showBoundingOutlines: true,
    vehicleBoundingOutlineShape: 'circle',
    ...overrides,
  }
}

describe('DebugOverlayPanel', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('reflects the controlled checkbox state', () => {
    harness = mount(
      <DebugOverlayPanel config={baseConfig()} onChange={() => {}} />,
    )
    const checkbox = harness.container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!
    expect(checkbox.checked).toBe(true)
  })

  it('toggling the checkbox emits an updated config', () => {
    const onChange = vi.fn()
    harness = mount(
      <DebugOverlayPanel config={baseConfig()} onChange={onChange} />,
    )
    const checkbox = harness.container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!
    act(() => {
      checkbox.click()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      showBoundingOutlines: false,
      vehicleBoundingOutlineShape: 'circle',
    })
  })

  it('reflects the controlled vehicle outline shape', () => {
    harness = mount(
      <DebugOverlayPanel
        config={baseConfig({ vehicleBoundingOutlineShape: 'rectangle' })}
        onChange={() => {}}
      />,
    )
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.debug-overlay-panel-select',
    )!
    expect(select.value).toBe('rectangle')
  })

  it('changing the select emits an updated config with the new shape', () => {
    const onChange = vi.fn()
    harness = mount(
      <DebugOverlayPanel config={baseConfig()} onChange={onChange} />,
    )
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.debug-overlay-panel-select',
    )!
    act(() => {
      select.value = 'rectangle'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({
      showBoundingOutlines: true,
      vehicleBoundingOutlineShape: 'rectangle',
    })
  })

  it('disables the vehicle outline select while outlines are hidden', () => {
    harness = mount(
      <DebugOverlayPanel
        config={baseConfig({ showBoundingOutlines: false })}
        onChange={() => {}}
      />,
    )
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.debug-overlay-panel-select',
    )!
    expect(select.disabled).toBe(true)
  })
})
