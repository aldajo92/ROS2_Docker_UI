// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ControlPanel } from './ControlPanel'

// `ControlPanel` reads `useSimulation()` for scenario loading. These
// tests focus on the controlled recording props, so we mock the hook
// with the smallest possible stand-in. `vi.mock` is hoisted by Vitest's
// transform, so the `ControlPanel` import above already sees the mock.
const controllerMock = {
  loadScenarioFromJson: vi.fn(),
}

vi.mock('../app/useSimulation', () => ({
  useSimulation: () => ({
    controller: controllerMock,
    engine: {} as unknown,
    commandQueue: {} as unknown,
  }),
  useSimulationRunning: () => false,
  useSimulationTime: () => 0,
  useEntityListVersion: () => 0,
}))

describe('ControlPanel — recording controls (Phase 4)', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = (ui: React.ReactNode) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(ui)
    })
  }

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  it('does NOT render the recording checkbox when no callback is provided', () => {
    mount(<ControlPanel />)
    expect(
      container.querySelector('.scenario-picker-record-label'),
    ).toBeNull()
  })

  it('does NOT render simulation run controls', () => {
    mount(<ControlPanel />)
    const buttonLabels = [...container.querySelectorAll('button')].map(
      (button) => button.textContent,
    )
    expect(buttonLabels).not.toContain('Start')
    expect(buttonLabels).not.toContain('Pause')
    expect(buttonLabels).not.toContain('Step')
    expect(buttonLabels).not.toContain('Reset')
  })

  it('renders an unchecked "Record while simulation runs" checkbox by default', () => {
    mount(
      <ControlPanel onRecordWhileRunningChange={() => undefined} />,
    )
    const label = container.querySelector('.scenario-picker-record-label')
    expect(label?.textContent).toContain('Record while simulation runs')
    const checkbox = label?.querySelector('input[type="checkbox"]')
    expect((checkbox as HTMLInputElement | null)?.checked).toBe(false)
  })

  it('reflects the controlled `recordWhileRunning` prop', () => {
    mount(
      <ControlPanel
        recordWhileRunning
        onRecordWhileRunningChange={() => undefined}
      />,
    )
    const checkbox = container.querySelector(
      '.scenario-picker-record-label input[type="checkbox"]',
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('emits `onRecordWhileRunningChange(true)` when the user toggles it', () => {
    const onChange = vi.fn()
    mount(
      <ControlPanel onRecordWhileRunningChange={onChange} />,
    )
    const checkbox = container.querySelector(
      '.scenario-picker-record-label input[type="checkbox"]',
    ) as HTMLInputElement
    act(() => {
      checkbox.click()
    })
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('does NOT render the Save button when no callback is provided', () => {
    mount(<ControlPanel />)
    expect(
      container.querySelector('[data-testid="control-panel-save-recording"]'),
    ).toBeNull()
  })

  it('renders the Save button enabled when not gated', () => {
    mount(<ControlPanel onSaveRecording={() => undefined} />)
    const button = container.querySelector(
      '[data-testid="control-panel-save-recording"]',
    ) as HTMLButtonElement
    expect(button).not.toBeNull()
    expect(button.disabled).toBe(false)
  })

  it('disables the Save button and surfaces the reason via title + hint', () => {
    mount(
      <ControlPanel
        onSaveRecording={() => undefined}
        saveRecordingDisabled
        saveRecordingDisabledReason="Pause the simulation before saving the recording."
      />,
    )
    const button = container.querySelector(
      '[data-testid="control-panel-save-recording"]',
    ) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe(
      'Pause the simulation before saving the recording.',
    )
    const hint = container.querySelector('.scenario-picker-save-hint')
    expect(hint?.textContent).toBe(
      'Pause the simulation before saving the recording.',
    )
  })

  it('does not call the save handler while the button is disabled', () => {
    const onSave = vi.fn()
    mount(
      <ControlPanel
        onSaveRecording={onSave}
        saveRecordingDisabled
        saveRecordingDisabledReason="Disabled"
      />,
    )
    const button = container.querySelector(
      '[data-testid="control-panel-save-recording"]',
    ) as HTMLButtonElement
    act(() => {
      button.click()
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('invokes `onSaveRecording` when the Save button is enabled and clicked', () => {
    const onSave = vi.fn()
    mount(<ControlPanel onSaveRecording={onSave} />)
    const button = container.querySelector(
      '[data-testid="control-panel-save-recording"]',
    ) as HTMLButtonElement
    act(() => {
      button.click()
    })
    expect(onSave).toHaveBeenCalledTimes(1)
  })
})
