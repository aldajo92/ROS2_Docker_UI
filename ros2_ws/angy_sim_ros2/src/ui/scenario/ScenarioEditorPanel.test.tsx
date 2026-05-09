// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ScenarioEditorPanel } from './ScenarioEditorPanel'

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

const SAMPLE_TEXT = JSON.stringify(
  {
    name: 'demo',
    entities: [
      { kind: 'vehicle', id: 'ego', pose: { x: 0, y: 0, yaw: 0 } },
    ],
  },
  null,
  2,
)

describe('ScenarioEditorPanel', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
    vi.clearAllMocks()
  })

  it('renders the empty state and disables every action when no scenario is loaded', () => {
    harness = mount(<ScenarioEditorPanel />)
    const { container } = harness

    expect(container.textContent).toContain('Load a scenario to edit it.')
    expect(
      container.querySelector('[data-testid="scenario-editor-preview"]'),
    ).toBeNull()
    expect(
      container.querySelector('[data-testid="scenario-editor-textarea"]'),
    ).toBeNull()

    const buttons = container.querySelectorAll(
      '.scenario-editor-actions button',
    )
    expect(buttons).toHaveLength(3)
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
      expect((btn as HTMLButtonElement).title).toBe('Load a scenario first')
    }
  })

  it('shows the read-only preview when a scenario text is provided', () => {
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    const preview = harness.container.querySelector(
      '[data-testid="scenario-editor-preview"]',
    ) as HTMLPreElement
    expect(preview).not.toBeNull()
    expect(preview.textContent).toBe(SAMPLE_TEXT)
    expect(preview.hidden).toBe(false)
    expect(
      harness.container.querySelector(
        '[data-testid="scenario-editor-textarea"]',
      ),
    ).toBeNull()
  })

  it('toggles the textarea on / off via the Edit scenario button', () => {
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    const toggle = harness.container.querySelector(
      '[data-testid="scenario-editor-toggle"]',
    ) as HTMLButtonElement

    expect(toggle.textContent).toBe('Edit scenario')

    act(() => {
      toggle.click()
    })

    const textarea = harness.container.querySelector(
      '[data-testid="scenario-editor-textarea"]',
    ) as HTMLTextAreaElement
    expect(textarea).not.toBeNull()
    expect(textarea.value).toBe(SAMPLE_TEXT)
    expect(toggle.textContent).toBe('Hide editor')

    // Preview is still rendered but hidden so React keeps the DOM stable
    // when the user collapses the editor.
    const preview = harness.container.querySelector(
      '[data-testid="scenario-editor-preview"]',
    ) as HTMLPreElement
    expect(preview.hidden).toBe(true)

    act(() => {
      toggle.click()
    })
    expect(
      harness.container.querySelector(
        '[data-testid="scenario-editor-textarea"]',
      ),
    ).toBeNull()
    expect(toggle.textContent).toBe('Edit scenario')
  })

  it('forwards textarea edits via onScenarioTextChange', () => {
    const onScenarioTextChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onScenarioTextChange={onScenarioTextChange}
      />,
    )
    const toggle = harness.container.querySelector(
      '[data-testid="scenario-editor-toggle"]',
    ) as HTMLButtonElement
    act(() => {
      toggle.click()
    })

    const textarea = harness.container.querySelector(
      '[data-testid="scenario-editor-textarea"]',
    ) as HTMLTextAreaElement
    // React 18's `onChange` handler is wired through a value-setter
    // hook on HTMLTextAreaElement. Assigning `textarea.value` directly
    // bypasses that tracker, so we have to call the prototype setter
    // explicitly before dispatching the synthetic `input` event.
    const next = SAMPLE_TEXT + '\n// edited'
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )?.set
    if (!nativeSetter) {
      throw new Error('Could not access HTMLTextAreaElement value setter')
    }
    act(() => {
      nativeSetter.call(textarea, next)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onScenarioTextChange).toHaveBeenCalledWith(next)
  })

  it('calls onApplyScenario with the current text on Apply changes', () => {
    const onApplyScenario = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onApplyScenario={onApplyScenario}
      />,
    )
    const apply = harness.container.querySelector(
      '[data-testid="scenario-editor-apply"]',
    ) as HTMLButtonElement
    act(() => {
      apply.click()
    })
    expect(onApplyScenario).toHaveBeenCalledWith(SAMPLE_TEXT)
  })

  it('calls onDownloadScenario with the current text on Download', () => {
    const onDownloadScenario = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onDownloadScenario={onDownloadScenario}
      />,
    )
    const download = harness.container.querySelector(
      '[data-testid="scenario-editor-download"]',
    ) as HTMLButtonElement
    act(() => {
      download.click()
    })
    expect(onDownloadScenario).toHaveBeenCalledWith(SAMPLE_TEXT)
  })

  it('renders an error message when errorMessage is provided', () => {
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        errorMessage="Invalid JSON: Unexpected token"
      />,
    )
    const error = harness.container.querySelector(
      '[data-testid="scenario-editor-error"]',
    )
    expect(error).not.toBeNull()
    expect(error?.textContent).toBe('Invalid JSON: Unexpected token')
  })

  it('disables every action and surfaces disabledReason when locked by parent', () => {
    const onApplyScenario = vi.fn()
    const onDownloadScenario = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        disabledReason="Editing is disabled while replay is active."
        onApplyScenario={onApplyScenario}
        onDownloadScenario={onDownloadScenario}
      />,
    )

    const buttons = harness.container.querySelectorAll(
      '.scenario-editor-actions button',
    )
    for (const btn of buttons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true)
      expect((btn as HTMLButtonElement).title).toBe(
        'Editing is disabled while replay is active.',
      )
    }

    const apply = harness.container.querySelector(
      '[data-testid="scenario-editor-apply"]',
    ) as HTMLButtonElement
    act(() => {
      apply.click()
    })
    expect(onApplyScenario).not.toHaveBeenCalled()
    expect(onDownloadScenario).not.toHaveBeenCalled()

    expect(harness.container.textContent).toContain(
      'Editing is disabled while replay is active.',
    )
  })
})

describe('ScenarioEditorPanel — copy to clipboard', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
    vi.clearAllMocks()
    vi.useRealTimers()
    // Remove the clipboard mock so other tests aren't affected.
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    })
  })

  const mountWithClipboard = (writeText: ReturnType<typeof vi.fn>) => {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    })
    return mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
  }

  it('renders the Copy button in preview mode when a scenario is loaded', () => {
    harness = mountWithClipboard(vi.fn().mockResolvedValue(undefined))
    const btn = harness.container.querySelector(
      '[data-testid="scenario-editor-copy"]',
    ) as HTMLButtonElement | null
    expect(btn).not.toBeNull()
    expect(btn?.title).toBe('Copy')
  })

  it('places the Copy button before Edit scenario in the actions row', () => {
    harness = mountWithClipboard(vi.fn().mockResolvedValue(undefined))
    const buttons = [
      ...harness.container.querySelectorAll('.scenario-editor-actions button'),
    ]
    expect(buttons).toHaveLength(4)
    expect(buttons[0].getAttribute('data-testid')).toBe('scenario-editor-copy')
    expect(buttons[1].getAttribute('data-testid')).toBe('scenario-editor-toggle')
  })

  it('shows the scenario file name in the preview toolbar', () => {
    harness = mountWithClipboard(vi.fn().mockResolvedValue(undefined))
    const fileName = harness.container.querySelector(
      '[data-testid="scenario-editor-preview-file-name"]',
    ) as HTMLElement | null
    expect(fileName).not.toBeNull()
    expect(fileName?.textContent).toBe('demo.json')
    expect(fileName?.title).toBe('demo.json')
  })

  it('falls back to scenario.json when the preview name cannot be read', () => {
    harness = mount(<ScenarioEditorPanel scenarioText="{ invalid json" />)
    const fileName = harness.container.querySelector(
      '[data-testid="scenario-editor-preview-file-name"]',
    ) as HTMLElement | null
    expect(fileName).not.toBeNull()
    expect(fileName?.textContent).toBe('scenario.json')
  })

  it('does not render the Copy button when the editor is in edit mode', () => {
    harness = mountWithClipboard(vi.fn().mockResolvedValue(undefined))
    const toggle = harness.container.querySelector(
      '[data-testid="scenario-editor-toggle"]',
    ) as HTMLButtonElement
    act(() => {
      toggle.click()
    })
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-copy"]'),
    ).toBeNull()
  })

  it('does not render the Copy button when locked by disabledReason', () => {
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        disabledReason="Editing disabled during replay."
      />,
    )
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-copy"]'),
    ).toBeNull()
  })

  it('does not render the Copy button when no scenario is loaded', () => {
    harness = mount(<ScenarioEditorPanel />)
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-copy"]'),
    ).toBeNull()
  })

  it('clicking Copy calls navigator.clipboard.writeText with the full scenarioText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    harness = mountWithClipboard(writeText)
    const btn = harness.container.querySelector(
      '[data-testid="scenario-editor-copy"]',
    ) as HTMLButtonElement

    await act(async () => {
      btn.click()
    })

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(SAMPLE_TEXT)
  })

  it('shows "Copied" after a successful clipboard write', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    harness = mountWithClipboard(writeText)
    const btn = harness.container.querySelector(
      '[data-testid="scenario-editor-copy"]',
    ) as HTMLButtonElement

    await act(async () => {
      btn.click()
    })

    expect(btn.title).toBe('Copied')
  })

  it('shows "Copy failed" after a rejected clipboard write', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    harness = mountWithClipboard(writeText)
    const btn = harness.container.querySelector(
      '[data-testid="scenario-editor-copy"]',
    ) as HTMLButtonElement

    await act(async () => {
      btn.click()
    })

    expect(btn.title).toBe('Copy failed')
  })

  it('shows "Copy failed" when the clipboard API is unavailable', async () => {
    vi.useFakeTimers()
    // Explicitly remove clipboard so the fallback path is exercised.
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    const btn = harness.container.querySelector(
      '[data-testid="scenario-editor-copy"]',
    ) as HTMLButtonElement

    await act(async () => {
      btn.click()
    })

    expect(btn.title).toBe('Copy failed')
  })

  it('resets the label back to "Copy" after the timeout elapses', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    harness = mountWithClipboard(writeText)
    const btn = harness.container.querySelector(
      '[data-testid="scenario-editor-copy"]',
    ) as HTMLButtonElement

    await act(async () => {
      btn.click()
    })
    expect(btn.title).toBe('Copied')

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(btn.title).toBe('Copy')
  })
})

describe('ScenarioEditorPanel — interaction safety', () => {
  let harness: Harness | null = null

  beforeEach(() => {
    harness = null
  })

  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('does not toggle the editor open when no scenario is loaded', () => {
    harness = mount(<ScenarioEditorPanel />)
    const toggle = harness.container.querySelector(
      '[data-testid="scenario-editor-toggle"]',
    ) as HTMLButtonElement
    act(() => {
      toggle.click()
    })
    expect(
      harness.container.querySelector(
        '[data-testid="scenario-editor-textarea"]',
      ),
    ).toBeNull()
  })
})

describe('ScenarioEditorPanel — expand/collapse', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
    vi.clearAllMocks()
  })

  it('renders the expand button in the header with default ARIA state', () => {
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    const button = harness.container.querySelector(
      '[data-testid="scenario-editor-expand"]',
    ) as HTMLButtonElement
    expect(button).not.toBeNull()
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('Expand scenario editor')
    expect(button.disabled).toBe(false)
    // The button lives inside the header, NOT inside the actions row.
    expect(
      harness.container.querySelectorAll('.scenario-editor-actions button'),
    ).toHaveLength(4)
    expect(
      harness.container.querySelector('.scenario-editor-header'),
    ).not.toBeNull()
  })

  it('disables the expand button until a scenario is loaded', () => {
    harness = mount(<ScenarioEditorPanel />)
    const button = harness.container.querySelector(
      '[data-testid="scenario-editor-expand"]',
    ) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.title).toBe('Load a scenario first')
  })

  it('calls onExpandedChange(true) when toggled from the collapsed state', () => {
    const onExpandedChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onExpandedChange={onExpandedChange}
      />,
    )
    const button = harness.container.querySelector(
      '[data-testid="scenario-editor-expand"]',
    ) as HTMLButtonElement
    act(() => {
      button.click()
    })
    expect(onExpandedChange).toHaveBeenCalledTimes(1)
    expect(onExpandedChange).toHaveBeenCalledWith(true)
  })

  it('calls onExpandedChange(false) when toggled from the expanded state', () => {
    const onExpandedChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        expanded
        onExpandedChange={onExpandedChange}
      />,
    )
    const button = harness.container.querySelector(
      '[data-testid="scenario-editor-expand"]',
    ) as HTMLButtonElement
    act(() => {
      button.click()
    })
    expect(onExpandedChange).toHaveBeenCalledWith(false)
  })

  it('reflects the expanded prop in ARIA state and class name', () => {
    harness = mount(
      <ScenarioEditorPanel scenarioText={SAMPLE_TEXT} expanded />,
    )
    const section = harness.container.querySelector(
      'section.scenario-editor-panel',
    ) as HTMLElement
    expect(section.classList.contains('scenario-editor-panel--expanded')).toBe(
      true,
    )
    const button = harness.container.querySelector(
      '[data-testid="scenario-editor-expand"]',
    ) as HTMLButtonElement
    expect(button.getAttribute('aria-pressed')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('Collapse scenario editor')
  })

  it('keeps Edit / Apply / Download functional while expanded', () => {
    const onApplyScenario = vi.fn()
    const onDownloadScenario = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        expanded
        onApplyScenario={onApplyScenario}
        onDownloadScenario={onDownloadScenario}
      />,
    )

    const toggle = harness.container.querySelector(
      '[data-testid="scenario-editor-toggle"]',
    ) as HTMLButtonElement
    act(() => {
      toggle.click()
    })
    expect(
      harness.container.querySelector(
        '[data-testid="scenario-editor-textarea"]',
      ),
    ).not.toBeNull()

    const apply = harness.container.querySelector(
      '[data-testid="scenario-editor-apply"]',
    ) as HTMLButtonElement
    act(() => {
      apply.click()
    })
    expect(onApplyScenario).toHaveBeenCalledWith(SAMPLE_TEXT)

    const download = harness.container.querySelector(
      '[data-testid="scenario-editor-download"]',
    ) as HTMLButtonElement
    act(() => {
      download.click()
    })
    expect(onDownloadScenario).toHaveBeenCalledWith(SAMPLE_TEXT)
  })

  it('keeps the expand button enabled even when locked by parent', () => {
    // Locking (e.g. replay mode) only freezes the editing actions —
    // the user should still be able to expand the card to read the
    // current scenario JSON without scrolling the inspector.
    const onExpandedChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        disabledReason="Editing is disabled while replay is active."
        onExpandedChange={onExpandedChange}
      />,
    )
    const button = harness.container.querySelector(
      '[data-testid="scenario-editor-expand"]',
    ) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    act(() => {
      button.click()
    })
    expect(onExpandedChange).toHaveBeenCalledWith(true)
  })
})

describe('ScenarioEditorPanel — filename toolbar', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
    vi.clearAllMocks()
  })

  it('shows filename derived from scenarioText when scenarioFileName prop is absent', () => {
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    const el = harness.container.querySelector(
      '[data-testid="scenario-editor-preview-file-name"]',
    ) as HTMLElement
    expect(el.textContent).toBe('demo.json')
    expect(el.title).toBe('demo.json')
  })

  it('shows the scenarioFileName prop when provided', () => {
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        scenarioFileName="custom-file.json"
      />,
    )
    const el = harness.container.querySelector(
      '[data-testid="scenario-editor-preview-file-name"]',
    ) as HTMLElement
    expect(el.textContent).toBe('custom-file.json')
  })

  it('falls back to scenario.json when the JSON text cannot be parsed', () => {
    harness = mount(<ScenarioEditorPanel scenarioText="{ invalid" />)
    const el = harness.container.querySelector(
      '[data-testid="scenario-editor-preview-file-name"]',
    ) as HTMLElement
    expect(el.textContent).toBe('scenario.json')
  })

  it('renders the edit icon button next to the filename', () => {
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-file-name-edit"]'),
    ).not.toBeNull()
  })

  it('clicking the edit button shows the filename input pre-filled', () => {
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        scenarioFileName="warehouse.json"
      />,
    )
    const editBtn = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-edit"]',
    ) as HTMLButtonElement
    act(() => { editBtn.click() })

    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.value).toBe('warehouse.json')
    // Span and edit button are gone while the input is shown.
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-preview-file-name"]'),
    ).toBeNull()
  })

  it('pressing Enter commits and calls onScenarioFileNameChange with normalized name', () => {
    const onChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        scenarioFileName="old.json"
        onScenarioFileNameChange={onChange}
      />,
    )
    const editBtn = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-edit"]',
    ) as HTMLButtonElement
    act(() => { editBtn.click() })

    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement

    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, 'value',
    )?.set
    act(() => {
      nativeSetter?.call(input, 'renamed')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith('renamed.json')
    // Input is gone, span is back.
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-file-name-input"]'),
    ).toBeNull()
  })

  it('pressing Enter with .json already present does not double-append', () => {
    const onChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onScenarioFileNameChange={onChange}
      />,
    )
    act(() => {
      harness!.container
        .querySelector<HTMLButtonElement>('[data-testid="scenario-editor-file-name-edit"]')
        ?.click()
    })
    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      nativeSetter?.call(input, 'demo.json')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledWith('demo.json')
  })

  it('pressing Escape cancels without calling onScenarioFileNameChange', () => {
    const onChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onScenarioFileNameChange={onChange}
      />,
    )
    act(() => {
      harness!.container
        .querySelector<HTMLButtonElement>('[data-testid="scenario-editor-file-name-edit"]')
        ?.click()
    })
    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onChange).not.toHaveBeenCalled()
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-file-name-input"]'),
    ).toBeNull()
  })

  it('blurring the input commits a non-empty value', () => {
    const onChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onScenarioFileNameChange={onChange}
      />,
    )
    act(() => {
      harness!.container
        .querySelector<HTMLButtonElement>('[data-testid="scenario-editor-file-name-edit"]')
        ?.click()
    })
    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    // Set DOM value first, then fire focusout (which bubbles and is
    // what React 18 uses for onBlur delegation). The handler reads
    // e.currentTarget.value so state-flush order doesn't matter.
    nativeSetter?.call(input, 'blurred')
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    })
    expect(onChange).toHaveBeenCalledWith('blurred.json')
  })

  it('blurring with an empty value does not call onScenarioFileNameChange', () => {
    const onChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onScenarioFileNameChange={onChange}
      />,
    )
    act(() => {
      harness!.container
        .querySelector<HTMLButtonElement>('[data-testid="scenario-editor-file-name-edit"]')
        ?.click()
    })
    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    nativeSetter?.call(input, '   ')
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }))
    })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('editing the filename does not mutate the scenarioText', () => {
    const onChange = vi.fn()
    harness = mount(
      <ScenarioEditorPanel
        scenarioText={SAMPLE_TEXT}
        onScenarioFileNameChange={onChange}
      />,
    )
    act(() => {
      harness!.container
        .querySelector<HTMLButtonElement>('[data-testid="scenario-editor-file-name-edit"]')
        ?.click()
    })
    const input = harness.container.querySelector(
      '[data-testid="scenario-editor-file-name-input"]',
    ) as HTMLInputElement
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      nativeSetter?.call(input, 'newname')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    // The pre element should still contain the original JSON text unchanged.
    const preview = harness.container.querySelector(
      '[data-testid="scenario-editor-preview"]',
    ) as HTMLPreElement
    expect(preview.textContent).toBe(SAMPLE_TEXT)
  })

  it('filename toolbar is hidden while editing the JSON textarea', () => {
    harness = mount(<ScenarioEditorPanel scenarioText={SAMPLE_TEXT} />)
    act(() => {
      harness!.container
        .querySelector<HTMLButtonElement>('[data-testid="scenario-editor-toggle"]')
        ?.click()
    })
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-preview-file-name"]'),
    ).toBeNull()
    expect(
      harness.container.querySelector('[data-testid="scenario-editor-file-name-edit"]'),
    ).toBeNull()
  })
})
