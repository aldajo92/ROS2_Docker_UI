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

// Shared harness. Both describe blocks mount through the same helper
// to avoid duplicating boilerplate; each test grabs `container` from
// the returned tuple to query the rendered DOM.
interface Harness {
  container: HTMLDivElement
  root: Root
}

const mountControlPanel = (ui: React.ReactNode): Harness => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return { container, root }
}

const unmountControlPanel = (harness: Harness | null) => {
  if (!harness) return
  act(() => {
    harness.root.unmount()
  })
  harness.container.remove()
}

describe('ControlPanel — recording controls (Phase 4)', () => {
  let harness: Harness | null = null
  let container: HTMLDivElement

  const mount = (ui: React.ReactNode) => {
    harness = mountControlPanel(ui)
    container = harness.container
  }

  afterEach(() => {
    unmountControlPanel(harness)
    harness = null
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

describe('ControlPanel — scenario upload', () => {
  let harness: Harness | null = null
  let container: HTMLDivElement

  const mount = (ui: React.ReactNode) => {
    harness = mountControlPanel(ui)
    container = harness.container
  }

  // Drive the hidden file input the same way a browser would: assign
  // the `files` list and dispatch a native `change` event. React 18+
  // listens at the root container, so the synthetic onChange fires.
  const triggerFileSelection = async (
    input: HTMLInputElement,
    file: File | null,
  ) => {
    Object.defineProperty(input, 'files', {
      value: file ? [file] : [],
      configurable: true,
    })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      // Allow the async handler to resolve `await file.text()` and the
      // subsequent setState calls.
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  afterEach(() => {
    unmountControlPanel(harness)
    harness = null
    vi.clearAllMocks()
  })

  it('renders the upload button and a hidden JSON file input', () => {
    mount(<ControlPanel />)
    const button = container.querySelector(
      '[data-testid="control-panel-upload-scenario"]',
    ) as HTMLButtonElement
    const input = container.querySelector(
      '[data-testid="control-panel-upload-input"]',
    ) as HTMLInputElement
    expect(button).not.toBeNull()
    expect(button.textContent).toBe('Upload scenario JSON')
    expect(input).not.toBeNull()
    expect(input.type).toBe('file')
    expect(input.accept).toBe('application/json,.json')
    expect(input.hidden).toBe(true)
  })

  it('loads a valid uploaded scenario through the same flow as the dropdown', async () => {
    const onScenarioLoaded = vi.fn()
    mount(<ControlPanel onScenarioLoaded={onScenarioLoaded} />)
    const input = container.querySelector(
      '[data-testid="control-panel-upload-input"]',
    ) as HTMLInputElement
    const scenario = {
      name: 'uploaded',
      entities: [
        { kind: 'vehicle', id: 'ego', pose: { x: 0, y: 0, yaw: 0 } },
      ],
    }
    const file = new File([JSON.stringify(scenario)], 'uploaded.json', {
      type: 'application/json',
    })

    await triggerFileSelection(input, file)

    expect(onScenarioLoaded).toHaveBeenCalledTimes(1)
    expect(onScenarioLoaded.mock.calls[0][0]).toMatchObject({
      name: 'uploaded',
    })
    expect(controllerMock.loadScenarioFromJson).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.error')).toBeNull()
  })

  it('rejects an invalid scenario and surfaces the error without loading', async () => {
    const onScenarioLoaded = vi.fn()
    mount(<ControlPanel onScenarioLoaded={onScenarioLoaded} />)
    const input = container.querySelector(
      '[data-testid="control-panel-upload-input"]',
    ) as HTMLInputElement
    const file = new File(['{ broken'], 'bad.json', {
      type: 'application/json',
    })

    await triggerFileSelection(input, file)

    expect(onScenarioLoaded).not.toHaveBeenCalled()
    expect(controllerMock.loadScenarioFromJson).not.toHaveBeenCalled()
    const errorNode = container.querySelector('.error')
    expect(errorNode?.textContent).toMatch(/Invalid JSON:/)
  })

  it('rejects an uploaded replay file with the dedicated message', async () => {
    const onScenarioLoaded = vi.fn()
    mount(<ControlPanel onScenarioLoaded={onScenarioLoaded} />)
    const input = container.querySelector(
      '[data-testid="control-panel-upload-input"]',
    ) as HTMLInputElement
    const replay = {
      format: 'angy_sim_replay',
      version: 1,
      fixedDtSec: 1 / 60,
      frames: [{ tick: 1, timeSec: 0, entities: [] }],
    }
    const file = new File(
      [JSON.stringify(replay)],
      'pretending-to-be-a-scenario.json',
      { type: 'application/json' },
    )

    await triggerFileSelection(input, file)

    expect(onScenarioLoaded).not.toHaveBeenCalled()
    expect(controllerMock.loadScenarioFromJson).not.toHaveBeenCalled()
    const errorNode = container.querySelector('.error')
    expect(errorNode?.textContent).toContain(
      'This is a replay file, not a scenario file.',
    )
  })

  it('calls onUploadedFileName with the file name on a successful upload', async () => {
    const onUploadedFileName = vi.fn()
    mount(
      <ControlPanel
        onScenarioLoaded={vi.fn()}
        onUploadedFileName={onUploadedFileName}
      />,
    )
    const input = container.querySelector(
      '[data-testid="control-panel-upload-input"]',
    ) as HTMLInputElement
    const file = new File(
      [JSON.stringify({ name: 'test', entities: [{ kind: 'vehicle', id: 'ego', pose: { x: 0, y: 0, yaw: 0 } }] })],
      'custom-map.json',
      { type: 'application/json' },
    )

    await triggerFileSelection(input, file)

    expect(onUploadedFileName).toHaveBeenCalledTimes(1)
    expect(onUploadedFileName).toHaveBeenCalledWith('custom-map.json')
  })

  it('does NOT call onUploadedFileName when the file fails to parse', async () => {
    const onUploadedFileName = vi.fn()
    mount(<ControlPanel onUploadedFileName={onUploadedFileName} />)
    const input = container.querySelector(
      '[data-testid="control-panel-upload-input"]',
    ) as HTMLInputElement
    const file = new File(['{ bad json'], 'broken.json', { type: 'application/json' })

    await triggerFileSelection(input, file)

    expect(onUploadedFileName).not.toHaveBeenCalled()
  })

  it('keeps the existing dropdown Load button (no regression)', () => {
    mount(<ControlPanel />)
    const buttons = [...container.querySelectorAll('button')].map(
      (b) => b.textContent,
    )
    expect(buttons).toContain('Load')
  })
})
