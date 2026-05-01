// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PerformancePanel } from './PerformancePanel'

interface Harness {
  container: HTMLDivElement
  root: Root
}

function mountPanel(ui: React.ReactNode): Harness {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, root }
}

function unmount(harness: Harness | null): void {
  if (!harness) return
  act(() => {
    harness.root.unmount()
  })
  harness.container.remove()
}

describe('PerformancePanel', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('reflects the controlled checkbox state', () => {
    harness = mountPanel(
      <PerformancePanel
        showPerformanceOverlay
        onShowPerformanceOverlayChange={() => {}}
        updateIntervalMs={250}
        onUpdateIntervalMsChange={() => {}}
      />,
    )
    const checkbox = harness.container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )
    expect(checkbox).not.toBeNull()
    expect(checkbox!.checked).toBe(true)
  })

  it('invokes the change handler with the next value when toggled', () => {
    const onChange = vi.fn()
    harness = mountPanel(
      <PerformancePanel
        showPerformanceOverlay={false}
        onShowPerformanceOverlayChange={onChange}
        updateIntervalMs={250}
        onUpdateIntervalMsChange={() => {}}
      />,
    )
    const checkbox = harness.container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!
    act(() => {
      checkbox.click()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('selects the refresh-rate preset matching the current interval', () => {
    harness = mountPanel(
      <PerformancePanel
        showPerformanceOverlay
        onShowPerformanceOverlayChange={() => {}}
        updateIntervalMs={500}
        onUpdateIntervalMsChange={() => {}}
      />,
    )
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.performance-panel-select',
    )!
    expect(select.value).toBe('500')
  })

  it('falls back to the nearest preset for out-of-band values', () => {
    harness = mountPanel(
      <PerformancePanel
        showPerformanceOverlay
        onShowPerformanceOverlayChange={() => {}}
        updateIntervalMs={333}
        onUpdateIntervalMsChange={() => {}}
      />,
    )
    // 333 is closer to 250 than to 500, so the dropdown should snap
    // to the 250 ms preset rather than render a blank value.
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.performance-panel-select',
    )!
    expect(select.value).toBe('250')
  })

  it('emits the selected interval value as a number on change', () => {
    const onIntervalChange = vi.fn()
    harness = mountPanel(
      <PerformancePanel
        showPerformanceOverlay
        onShowPerformanceOverlayChange={() => {}}
        updateIntervalMs={250}
        onUpdateIntervalMsChange={onIntervalChange}
      />,
    )
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.performance-panel-select',
    )!
    act(() => {
      select.value = '1000'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(onIntervalChange).toHaveBeenCalledTimes(1)
    expect(onIntervalChange).toHaveBeenCalledWith(1000)
  })

  it('disables the refresh-rate select while the overlay is hidden', () => {
    harness = mountPanel(
      <PerformancePanel
        showPerformanceOverlay={false}
        onShowPerformanceOverlayChange={() => {}}
        updateIntervalMs={250}
        onUpdateIntervalMsChange={() => {}}
      />,
    )
    const select = harness.container.querySelector<HTMLSelectElement>(
      '.performance-panel-select',
    )!
    expect(select.disabled).toBe(true)
  })
})
