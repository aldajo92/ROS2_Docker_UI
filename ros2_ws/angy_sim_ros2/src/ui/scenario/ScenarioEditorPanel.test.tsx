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
