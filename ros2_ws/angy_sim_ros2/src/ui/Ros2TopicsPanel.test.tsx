// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Ros2TopicsPanel } from './Ros2TopicsPanel'
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
import type {
  TopicDiscoveryState,
  TopicDiscoveryStatus,
  TopicInfo,
} from '../app/TopicDiscovery'

/* ----------------------------- harness ----------------------------- */

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
        <Ros2TopicsPanel />
      </CommunicationContext.Provider>,
    )
  })
  return { container, root }
}

function rerender(harness: Harness, value: CommunicationContextValue): void {
  act(() => {
    harness.root.render(
      <CommunicationContext.Provider value={value}>
        <Ros2TopicsPanel />
      </CommunicationContext.Provider>,
    )
  })
}

function unmount(harness: Harness | null): void {
  if (!harness) return
  act(() => {
    harness.root.unmount()
  })
  harness.container.remove()
}

/* ----------------------------- factories --------------------------- */

function makeConfig(
  kind: TransportKind,
  rosbridgeUrl: string = DEFAULT_ROSBRIDGE_URL,
): TransportConfig {
  return { kind, rosbridgeUrl }
}

function makeDiscovery(
  overrides: Partial<TopicDiscoveryState> & { status: TopicDiscoveryStatus },
): TopicDiscoveryState {
  return {
    topics: [],
    refresh: vi.fn(),
    ...overrides,
  } as TopicDiscoveryState
}

function makeContext(
  overrides: Partial<CommunicationContextValue> = {},
): CommunicationContextValue {
  return {
    config: makeConfig('rosbridge'),
    status: 'connected',
    setConfig: vi.fn(),
    topicDiscovery: makeDiscovery({
      status: 'ready',
      topics: [
        { name: '/demo/counter', type: 'std_msgs/msg/Int32' },
        { name: '/demo/string_message', type: 'std_msgs/msg/String' },
      ],
      lastUpdated: Date.UTC(2026, 4, 2, 19, 55, 12),
    }),
    ...overrides,
  }
}

/* ----------------------------- DOM helpers ------------------------- */

function queryPanel(container: HTMLDivElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('.ros2-topics-panel')
}

function getRefreshButton(container: HTMLDivElement): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>(
    '.ros2-topics-refresh',
  )
  if (!btn) throw new Error('Refresh button not found')
  return btn
}

function getToggleButton(container: HTMLDivElement): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>('.ros2-topics-toggle')
  if (!btn) throw new Error('Toggle button not found')
  return btn
}

function getSystemToggleCheckbox(container: HTMLDivElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '.ros2-topics-system-toggle input[type="checkbox"]',
  )
  if (!input) throw new Error('System-topics checkbox not found')
  return input
}

function queryTopicList(container: HTMLDivElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('#ros2-topics-list')
}

function getRowNames(container: HTMLDivElement): string[] {
  const rows = container.querySelectorAll<HTMLElement>(
    '.ros2-topics-row .ros2-topics-name',
  )
  return Array.from(rows).map((el) => el.textContent?.trim() ?? '')
}

function getCountText(container: HTMLDivElement): string {
  return (
    container.querySelector('.ros2-topics-count')?.textContent?.trim() ?? ''
  )
}

function getErrorText(container: HTMLDivElement): string {
  return (
    container.querySelector('.ros2-topics-error')?.textContent?.trim() ?? ''
  )
}

/* ------------------------------ tests ------------------------------ */

describe('Ros2TopicsPanel — visibility matrix', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  const hiddenCases: Array<{
    name: string
    ctx: () => CommunicationContextValue
  }> = [
    {
      name: 'transport=none / status=disabled',
      ctx: () =>
        makeContext({
          config: makeConfig('none'),
          status: 'disabled',
          topicDiscovery: undefined,
        }),
    },
    {
      name: 'transport=mock / status=connected',
      ctx: () =>
        makeContext({
          config: makeConfig('mock'),
          status: 'connected',
          topicDiscovery: undefined,
        }),
    },
    {
      name: 'transport=memory / status=connected',
      ctx: () =>
        makeContext({
          config: makeConfig('memory'),
          status: 'connected',
          topicDiscovery: undefined,
        }),
    },
    {
      name: 'transport=rosbridge / status=disconnected',
      ctx: () =>
        makeContext({
          status: 'disconnected',
          topicDiscovery: undefined,
        }),
    },
    {
      name: 'transport=rosbridge / status=connecting',
      ctx: () =>
        makeContext({
          status: 'connecting',
          topicDiscovery: undefined,
        }),
    },
    {
      name: 'transport=rosbridge / status=error',
      ctx: () =>
        makeContext({
          status: 'error',
          topicDiscovery: undefined,
        }),
    },
  ]

  for (const { name, ctx } of hiddenCases) {
    it(`renders nothing for ${name}`, () => {
      harness = mountPanel(ctx())
      expect(queryPanel(harness.container)).toBeNull()
    })
  }

  it('renders nothing if rosbridge connected but discovery capability is missing', () => {
    // Defensive: provider should always supply discovery when both
    // gates pass, but the panel must not assume that.
    harness = mountPanel(
      makeContext({ status: 'connected', topicDiscovery: undefined }),
    )
    expect(queryPanel(harness.container)).toBeNull()
  })

  it('renders the card when rosbridge is connected and discovery is supplied', () => {
    harness = mountPanel(makeContext())
    const panel = queryPanel(harness.container)
    expect(panel).not.toBeNull()
    expect(panel?.querySelector('h2')?.textContent).toBe('ROS2 Topics')
  })
})

describe('Ros2TopicsPanel — summary + refresh', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('shows the topic count, last updated, and a Refresh button', () => {
    harness = mountPanel(makeContext())
    const c = harness.container
    expect(getCountText(c)).toBe('Topics: 2 discovered')

    const meta = c.querySelector('.ros2-topics-meta')?.textContent ?? ''
    expect(meta).toContain('Last updated:')

    expect(getRefreshButton(c).textContent).toBe('Refresh topics')
  })

  it('calls the discovery refresh function when the button is clicked', () => {
    const refresh = vi.fn()
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: [{ name: '/x', type: 'std_msgs/msg/String' }],
          lastUpdated: Date.now(),
          refresh,
        }),
      }),
    )

    act(() => {
      getRefreshButton(harness!.container).click()
    })

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('disables the Refresh button and shows a loading label while loading', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'loading',
          topics: [],
        }),
      }),
    )
    const btn = getRefreshButton(harness.container)
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toBe('Refreshing…')
  })

  it('hides the Last updated line until the first refresh succeeds', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'idle',
          topics: [],
        }),
      }),
    )
    expect(harness.container.querySelector('.ros2-topics-meta')).toBeNull()
  })

  it('renders the discovery error message under the summary', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'error',
          topics: [],
          error: 'service /rosapi/topics unavailable',
        }),
      }),
    )
    expect(getErrorText(harness.container)).toBe(
      'service /rosapi/topics unavailable',
    )
  })
})

describe('Ros2TopicsPanel — list expansion', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('hides the topic list by default', () => {
    harness = mountPanel(makeContext())
    expect(queryTopicList(harness.container)).toBeNull()
    expect(getToggleButton(harness.container).textContent).toBe('Show topics')
  })

  it('expands the list when "Show topics" is clicked', () => {
    harness = mountPanel(makeContext())
    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(queryTopicList(harness.container)).not.toBeNull()
    expect(getToggleButton(harness.container).textContent).toBe('Hide topics')
    expect(getRowNames(harness.container)).toEqual([
      '/demo/counter',
      '/demo/string_message',
    ])
  })

  it('collapses the list when "Hide topics" is clicked', () => {
    harness = mountPanel(makeContext())
    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(queryTopicList(harness.container)).not.toBeNull()

    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(queryTopicList(harness.container)).toBeNull()
    expect(getToggleButton(harness.container).textContent).toBe('Show topics')
  })

  it('renders an Echo button per row that is disabled with a tooltip', () => {
    harness = mountPanel(makeContext())
    act(() => {
      getToggleButton(harness!.container).click()
    })
    const echoButtons = harness.container.querySelectorAll<HTMLButtonElement>(
      '.ros2-topics-action',
    )
    expect(echoButtons.length).toBe(2)
    for (const btn of Array.from(echoButtons)) {
      expect(btn.textContent).toBe('Echo')
      expect(btn.disabled).toBe(true)
      expect(btn.title).toBe('Topic echo coming next')
    }
  })

  it('shows the topic type when available, em-dash when missing', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: [
            { name: '/typed', type: 'std_msgs/msg/String' },
            { name: '/untyped' },
          ],
          lastUpdated: Date.now(),
        }),
      }),
    )
    act(() => {
      getToggleButton(harness!.container).click()
    })
    const types = Array.from(
      harness.container.querySelectorAll<HTMLElement>('.ros2-topics-type'),
    ).map((el) => el.textContent?.trim() ?? '')
    expect(types).toEqual(['std_msgs/msg/String', '—'])
  })
})

describe('Ros2TopicsPanel — system-topic filter', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  const baseTopics: TopicInfo[] = [
    { name: '/rosout', type: 'rcl_interfaces/msg/Log' },
    { name: '/parameter_events', type: 'rcl_interfaces/msg/ParameterEvent' },
    { name: '/rosapi/topics', type: 'rosapi_msgs/msg/Empty' },
    { name: '/client_count', type: 'std_msgs/msg/Int32' },
    { name: '/connected_clients', type: 'rosbridge_msgs/msg/ConnectedClients' },
    { name: '/demo/counter', type: 'std_msgs/msg/Int32' },
    { name: '/demo/string_message', type: 'std_msgs/msg/String' },
  ]

  it('hides system topics by default — both in the count and the list', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: baseTopics,
          lastUpdated: Date.now(),
        }),
      }),
    )
    expect(getCountText(harness.container)).toBe('Topics: 2 discovered')

    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(getRowNames(harness.container)).toEqual([
      '/demo/counter',
      '/demo/string_message',
    ])
  })

  it('does NOT render the "Show system topics" checkbox while the list is collapsed', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: baseTopics,
          lastUpdated: Date.now(),
        }),
      }),
    )
    expect(
      harness.container.querySelector('.ros2-topics-system-toggle'),
    ).toBeNull()
  })

  it('renders the "Show system topics" checkbox once the list is expanded', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: baseTopics,
          lastUpdated: Date.now(),
        }),
      }),
    )
    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(
      harness.container.querySelector('.ros2-topics-system-toggle'),
    ).not.toBeNull()
    expect(getSystemToggleCheckbox(harness.container).checked).toBe(false)
  })

  it('hides the "Show system topics" checkbox again when the list is collapsed', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: baseTopics,
          lastUpdated: Date.now(),
        }),
      }),
    )
    // expand
    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(
      harness.container.querySelector('.ros2-topics-system-toggle'),
    ).not.toBeNull()

    // collapse again
    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(
      harness.container.querySelector('.ros2-topics-system-toggle'),
    ).toBeNull()
  })

  it('includes system topics when "Show system topics" is enabled', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: baseTopics,
          lastUpdated: Date.now(),
        }),
      }),
    )

    // The system toggle is only rendered while the list is expanded,
    // so we open it first — then flip the checkbox.
    act(() => {
      getToggleButton(harness!.container).click()
    })

    const checkbox = getSystemToggleCheckbox(harness.container)
    expect(checkbox.checked).toBe(false)

    act(() => {
      checkbox.click()
    })
    expect(getSystemToggleCheckbox(harness.container).checked).toBe(true)
    expect(getCountText(harness.container)).toBe('Topics: 7 discovered')

    expect(getRowNames(harness.container)).toEqual([
      '/client_count',
      '/connected_clients',
      '/demo/counter',
      '/demo/string_message',
      '/parameter_events',
      '/rosapi/topics',
      '/rosout',
    ])
  })

  it('preserves the "Show system topics" choice across collapse/expand cycles', () => {
    harness = mountPanel(
      makeContext({
        topicDiscovery: makeDiscovery({
          status: 'ready',
          topics: baseTopics,
          lastUpdated: Date.now(),
        }),
      }),
    )
    // expand → check the box → collapse → expand again
    act(() => {
      getToggleButton(harness!.container).click()
    })
    act(() => {
      getSystemToggleCheckbox(harness!.container).click()
    })
    act(() => {
      getToggleButton(harness!.container).click()
    })
    // The count was 7 while expanded; it must stay at 7 even after
    // the checkbox itself unmounts on collapse, because state lives
    // in the panel, not in the DOM node.
    expect(getCountText(harness.container)).toBe('Topics: 7 discovered')

    act(() => {
      getToggleButton(harness!.container).click()
    })
    expect(getSystemToggleCheckbox(harness.container).checked).toBe(true)
  })
})

describe('Ros2TopicsPanel — provider lifecycle', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('renders the panel when discovery state arrives after mount, then disappears on disconnect', () => {
    // Initial: rosbridge selected but still connecting (no discovery
    // capability yet).
    harness = mountPanel(
      makeContext({
        status: 'connecting',
        topicDiscovery: undefined,
      }),
    )
    expect(queryPanel(harness.container)).toBeNull()

    // Connected: discovery capability arrives.
    rerender(harness, makeContext())
    expect(queryPanel(harness.container)).not.toBeNull()

    // Connection drops — UI must hide the panel again.
    rerender(
      harness,
      makeContext({
        status: 'disconnected',
        topicDiscovery: undefined,
      }),
    )
    expect(queryPanel(harness.container)).toBeNull()
  })
})

describe('Architecture: ConnectionStatusPanel does NOT render topic discovery UI', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  function mountConnection(value: CommunicationContextValue): Harness {
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

  function makeConnectionContext(
    status: TransportConnectionStatus,
  ): CommunicationContextValue {
    return {
      config: makeConfig('rosbridge'),
      status,
      setConfig: vi.fn(),
      topicDiscovery: makeDiscovery({
        status: 'ready',
        topics: [{ name: '/demo/counter', type: 'std_msgs/msg/Int32' }],
        lastUpdated: Date.now(),
      }),
    }
  }

  it('does not render the ROS2 Topics card from ConnectionStatusPanel', () => {
    harness = mountConnection(makeConnectionContext('connected'))
    expect(harness.container.querySelector('.ros2-topics-panel')).toBeNull()
    expect(harness.container.querySelector('#ros2-topics-list')).toBeNull()
    expect(
      harness.container.querySelector('.ros2-topics-refresh'),
    ).toBeNull()
    expect(
      harness.container.querySelector('.ros2-topics-toggle'),
    ).toBeNull()
  })

  it('does not mention topic-discovery copy in any of its labels', () => {
    harness = mountConnection(makeConnectionContext('connected'))
    const text = (harness.container.textContent ?? '').toLowerCase()
    // These are unique to the topics card. Connection card may say
    // "Connected", "Endpoint URL", "rosbridge" (the kind label) — but
    // never any of these.
    expect(text).not.toContain('refresh topics')
    expect(text).not.toContain('show topics')
    expect(text).not.toContain('hide topics')
    expect(text).not.toContain('show system topics')
    expect(text).not.toContain('topics: ')
  })
})

describe('Architecture: Ros2TopicsPanel does not import roslib', () => {
  // The roslib-isolation rule is exhaustively enforced by
  // `architecture.rosbridge.test.ts` (it scans every src/**/*.ts(x)
  // file). This stub leaves a clear breadcrumb in the panel-specific
  // suite so a developer touching this file remembers the rule.

  it('relies on architecture.rosbridge.test.ts for full coverage', () => {
    // Sanity ping so the suite has at least one assertion.
    expect(typeof Ros2TopicsPanel).toBe('function')
  })
})

/* ----------------------------- jsdom guards ------------------------ */

beforeEach(() => {
  // Ensure a clean slate between specs even though happy-dom is
  // per-process — some tests mutate document.body.
  document.body.innerHTML = ''
})
