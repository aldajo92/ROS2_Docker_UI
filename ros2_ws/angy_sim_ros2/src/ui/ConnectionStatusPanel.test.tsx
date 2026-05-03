// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ConnectionStatusPanel } from './ConnectionStatusPanel'
import {
  CommunicationContext,
  type CommunicationContextValue,
  type TransportConnectionStatus,
} from '../app/CommunicationContext'
import {
  DEFAULT_ROSBRIDGE_URL,
  type TransportConfig,
  type TransportKind,
} from '../app/TransportConfig'

interface Harness {
  container: HTMLDivElement
  root: Root
}

function mountPanel(value: CommunicationContextValue): Harness {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <CommunicationContext.Provider value={value}>
        <ConnectionStatusPanel />
      </CommunicationContext.Provider>,
    )
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

function makeContext(
  overrides: Partial<CommunicationContextValue> = {},
): CommunicationContextValue {
  return {
    config: { kind: 'none', rosbridgeUrl: DEFAULT_ROSBRIDGE_URL },
    status: 'disabled',
    setConfig: vi.fn(),
    ...overrides,
  }
}

function getKindSelect(container: HTMLDivElement): HTMLSelectElement {
  const select = container.querySelector<HTMLSelectElement>(
    '#connection-transport-kind',
  )
  if (!select) {
    throw new Error('Transport kind select not found')
  }
  return select
}

function queryEndpointInput(
  container: HTMLDivElement,
): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('#connection-endpoint-url')
}

function getStatusLabel(container: HTMLDivElement): string {
  const el = container.querySelector('.connection-status-label')
  return el?.textContent?.trim() ?? ''
}

function getHelpText(container: HTMLDivElement): string {
  const el = container.querySelector('.connection-status-hint')
  return el?.textContent?.trim() ?? ''
}

/**
 * Concatenated text of every "explanatory" region in the panel — the
 * status label, help text, and error message. The transport <select>
 * inevitably surfaces every kind name as an `<option>` label, so a
 * naive `container.textContent` scan would always trip over "rosbridge"
 * even in non-rosbridge states. The user requirement is about
 * explanatory copy ("the UI does not mention rosbridge unless
 * rosbridge is selected"), and that copy lives in these regions.
 */
function getExplanatoryText(container: HTMLDivElement): string {
  const parts: string[] = []
  for (const sel of [
    '.connection-status-label',
    '.connection-status-hint',
    '.connection-status-error',
    '.connection-status-target',
    '.connection-status-control-label',
  ]) {
    container.querySelectorAll(sel).forEach((el) => {
      parts.push(el.textContent ?? '')
    })
  }
  return parts.join(' ')
}

/**
 * Drives a controlled `<input>` through React's value-tracker the same
 * way browsers do. Setting `.value` directly bypasses the tracker, so
 * React sees no change and `onChange` never fires. Going through the
 * prototype setter is the standard happy-dom + React-19 workaround.
 */
function fireInputChange(input: HTMLInputElement, next: string): void {
  const proto = Object.getPrototypeOf(input) as HTMLInputElement
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor?.set?.call(input, next)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('ConnectionStatusPanel', () => {
  let harness: Harness | null = null

  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('shows the disabled state when "none" is selected and offers all four kinds', () => {
    harness = mountPanel(
      makeContext({
        config: { kind: 'none', rosbridgeUrl: DEFAULT_ROSBRIDGE_URL },
        status: 'disabled',
      }),
    )

    const select = getKindSelect(harness.container)
    expect(select.value).toBe('none')

    // The dropdown must offer the documented kinds — no more, no less.
    const optionValues = Array.from(select.options).map((o) => o.value)
    expect(optionValues).toEqual(['none', 'mock', 'memory', 'rosbridge'])

    expect(getStatusLabel(harness.container)).toBe('Transport disabled')
    expect(getHelpText(harness.container)).toBe('Transport disabled.')

    // No endpoint input is rendered for non-rosbridge kinds.
    expect(queryEndpointInput(harness.container)).toBeNull()

    // Status dot reflects "disabled".
    const dot = harness.container.querySelector('.connection-status-dot')
    expect(dot?.className).toContain('connection-status-dot-disabled')
  })

  it('shows the endpoint URL input when "rosbridge" is selected, defaulting to the configured URL', () => {
    harness = mountPanel(
      makeContext({
        config: {
          kind: 'rosbridge',
          rosbridgeUrl: 'ws://example.test:9090',
        },
        status: 'connected',
      }),
    )

    const input = queryEndpointInput(harness.container)
    expect(input).not.toBeNull()
    expect(input!.value).toBe('ws://example.test:9090')
    // Placeholder uses the documented default; never hardcoded inside JSX.
    expect(input!.placeholder).toBe(DEFAULT_ROSBRIDGE_URL)

    // Generic label — never "rosbridge URL".
    const label = harness.container.querySelector(
      'label[for="connection-endpoint-url"]',
    )
    expect(label?.textContent?.trim()).toBe('Endpoint URL')

    expect(getStatusLabel(harness.container)).toBe('Connected')
    expect(getHelpText(harness.container)).toBe(
      'Connects through rosbridge_server using WebSocket.',
    )
  })

  it('does not show the endpoint URL field for "mock" or "memory"', () => {
    for (const kind of ['mock', 'memory'] as TransportKind[]) {
      harness = mountPanel(
        makeContext({
          config: { kind, rosbridgeUrl: DEFAULT_ROSBRIDGE_URL },
          // The provider would push 'connected' for in-process transports
          // once the connect promise resolves; we mirror that here so
          // the help text path is exercised under a healthy state.
          status: 'connected',
        }),
      )

      expect(queryEndpointInput(harness.container)).toBeNull()
      // No "Endpoint URL" label gets rendered either — the field and
      // its label are conditioned on the same `showEndpoint` flag.
      const endpointLabel = harness.container.querySelector(
        'label[for="connection-endpoint-url"]',
      )
      expect(endpointLabel).toBeNull()
      expect(getKindSelect(harness.container).value).toBe(kind)

      // Explanatory copy must not name rosbridge while a non-rosbridge
      // kind is active. The transport <select> inevitably lists every
      // kind name as an option label — that is part of the picker, not
      // explanatory copy — so we scan only the labels/hints/errors.
      expect(getExplanatoryText(harness.container).toLowerCase()).not.toContain(
        'rosbridge',
      )

      unmount(harness)
      harness = null
    }
  })

  it('does not mention rosbridge in any default state when "none" is selected', () => {
    harness = mountPanel(
      makeContext({
        config: { kind: 'none', rosbridgeUrl: DEFAULT_ROSBRIDGE_URL },
        status: 'disabled',
      }),
    )

    expect(getExplanatoryText(harness.container).toLowerCase()).not.toContain(
      'rosbridge',
    )
    // And no leaked `VITE_*` instructions anywhere — the picker
    // replaces that prose entirely.
    const bodyText = harness.container.textContent ?? ''
    expect(bodyText).not.toContain('VITE_')
  })

  it('mentions rosbridge ONLY inside the rosbridge-specific help', () => {
    harness = mountPanel(
      makeContext({
        config: {
          kind: 'rosbridge',
          rosbridgeUrl: DEFAULT_ROSBRIDGE_URL,
        },
        status: 'connecting',
      }),
    )

    expect(getHelpText(harness.container)).toBe(
      'Connects through rosbridge_server using WebSocket.',
    )
    // Status copy stays generic — no transport-specific wording.
    expect(getStatusLabel(harness.container)).toBe('Connecting…')
  })

  it('renders all five generic status labels via the dot class', () => {
    const cases: ReadonlyArray<{
      status: TransportConnectionStatus
      label: string
    }> = [
      { status: 'disabled', label: 'Transport disabled' },
      { status: 'disconnected', label: 'Disconnected' },
      { status: 'connecting', label: 'Connecting…' },
      { status: 'connected', label: 'Connected' },
      { status: 'error', label: 'Error' },
    ]

    for (const { status, label } of cases) {
      harness = mountPanel(
        makeContext({
          // Use 'mock' so the picker is in a non-rosbridge state and we
          // exercise generic status rendering separately from the
          // rosbridge-specific endpoint UI.
          config: { kind: 'mock', rosbridgeUrl: DEFAULT_ROSBRIDGE_URL },
          status,
          errorMessage: status === 'error' ? 'boom' : undefined,
        }),
      )
      expect(getStatusLabel(harness.container)).toBe(label)
      const dot = harness.container.querySelector('.connection-status-dot')
      expect(dot?.className).toContain(`connection-status-dot-${status}`)
      unmount(harness)
      harness = null
    }
  })

  it('emits setConfig with the new TransportKind when the picker changes', () => {
    const setConfig = vi.fn()
    const initial: TransportConfig = {
      kind: 'none',
      rosbridgeUrl: DEFAULT_ROSBRIDGE_URL,
    }
    harness = mountPanel(
      makeContext({ config: initial, status: 'disabled', setConfig }),
    )

    const select = getKindSelect(harness.container)
    act(() => {
      select.value = 'rosbridge'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(setConfig).toHaveBeenCalledTimes(1)
    expect(setConfig).toHaveBeenCalledWith({
      kind: 'rosbridge',
      rosbridgeUrl: DEFAULT_ROSBRIDGE_URL,
    })
  })

  it('commits the endpoint URL on Enter and ignores no-op blurs', () => {
    const setConfig = vi.fn()
    harness = mountPanel(
      makeContext({
        config: {
          kind: 'rosbridge',
          rosbridgeUrl: 'ws://old.example:9090',
        },
        status: 'connected',
        setConfig,
      }),
    )

    const input = queryEndpointInput(harness.container)!

    // Editing without committing must not call setConfig. We push the
    // new value through React's native value-tracker so the controlled
    // input actually re-renders with the typed text.
    act(() => {
      fireInputChange(input, 'ws://new.example:9090')
    })
    expect(setConfig).not.toHaveBeenCalled()
    expect(input.value).toBe('ws://new.example:9090')

    // Pressing Enter commits the current draft.
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
    })
    expect(setConfig).toHaveBeenCalledTimes(1)
    expect(setConfig).toHaveBeenCalledWith({
      kind: 'rosbridge',
      rosbridgeUrl: 'ws://new.example:9090',
    })

    // Blurring without changes is a no-op.
    setConfig.mockClear()
    act(() => {
      input.dispatchEvent(new Event('blur', { bubbles: true }))
    })
    expect(setConfig).not.toHaveBeenCalled()
  })

  it('renders the error message when status is "error"', () => {
    harness = mountPanel(
      makeContext({
        config: {
          kind: 'rosbridge',
          rosbridgeUrl: DEFAULT_ROSBRIDGE_URL,
        },
        status: 'error',
        errorMessage: 'WebSocket refused',
      }),
    )

    const errorEl = harness.container.querySelector(
      '.connection-status-error',
    )
    expect(errorEl?.textContent).toContain('WebSocket refused')
  })
})
