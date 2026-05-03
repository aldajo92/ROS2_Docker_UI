// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EchoCard } from './EchoCard'
import type { TopicEchoSession } from '../app/TopicEcho'

interface Harness {
  container: HTMLDivElement
  root: Root
}

function mount(node: React.ReactNode): Harness {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(node)
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

function makeSession(
  overrides: Partial<TopicEchoSession> & { topicName: string },
): TopicEchoSession {
  return {
    topicName: overrides.topicName,
    topicType: overrides.topicType,
    status: overrides.status ?? 'listening',
    latestMessage: overrides.latestMessage,
    messageCount: overrides.messageCount ?? 0,
    lastReceivedAt: overrides.lastReceivedAt,
    error: overrides.error,
  }
}

function getTitle(container: HTMLDivElement): string {
  return container.querySelector('.echo-card-title')?.textContent?.trim() ?? ''
}

function getStatusText(container: HTMLDivElement): string {
  return (
    container
      .querySelector('[data-testid="echo-card-status"]')
      ?.textContent?.trim() ?? ''
  )
}

function getType(container: HTMLDivElement): string | null {
  // The type lives in the second <dd> when present, but we look it up
  // by sibling of the "Type" <dt> so we don't depend on ordering.
  const dts = Array.from(container.querySelectorAll('dt'))
  const typeDt = dts.find((dt) => dt.textContent?.trim() === 'Type')
  if (!typeDt) return null
  return typeDt.nextElementSibling?.textContent?.trim() ?? null
}

function queryWaiting(container: HTMLDivElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    '[data-testid="echo-card-waiting"]',
  )
}

function queryMessage(container: HTMLDivElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(
    '[data-testid="echo-card-message"]',
  )
}

function queryStop(container: HTMLDivElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    '[data-testid="echo-card-stop"]',
  )
}

function queryResume(container: HTMLDivElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    '[data-testid="echo-card-resume"]',
  )
}

function getClose(container: HTMLDivElement): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>(
    '[data-testid="echo-card-close"]',
  )
  if (!btn) throw new Error('Close button not found')
  return btn
}

/* ---------------------------- tests ---------------------------- */

describe('EchoCard — header and metadata', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('renders a generic title and surfaces the topic name in the metadata', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/cmd_vel' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    // The card title is now intentionally generic so stacked echo
    // cards read cleanly; the topic name has moved into the meta dl.
    expect(getTitle(harness.container)).toBe('Topic echo')
    const nameCell = harness.container.querySelector(
      '[data-testid="echo-card-name"]',
    )
    expect(nameCell?.textContent?.trim()).toBe('/cmd_vel')
    // Sanity: the section still distinguishes itself for screen readers
    // by including the topic in its aria-label.
    const section = harness.container.querySelector('[data-testid="echo-card"]')
    expect(section?.getAttribute('aria-label')).toBe('Topic echo: /cmd_vel')
  })

  it('renders the topic type when supplied', () => {
    harness = mount(
      <EchoCard
        session={makeSession({
          topicName: '/cmd_vel',
          topicType: 'geometry_msgs/msg/Twist',
        })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getType(harness.container)).toBe('geometry_msgs/msg/Twist')
  })

  it('omits the type row when no type is supplied', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/x' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getType(harness.container)).toBeNull()
  })

  it('displays the session status as a label', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/x', status: 'listening' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(getStatusText(harness.container)).toBe('listening')
  })
})

describe('EchoCard — message body', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('shows "Waiting for messages..." when no message has arrived yet', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/x' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    const waiting = queryWaiting(harness.container)
    expect(waiting).not.toBeNull()
    expect(waiting?.textContent?.trim()).toBe('Waiting for messages...')
    expect(queryMessage(harness.container)).toBeNull()
  })

  it('renders the latest payload as pretty JSON once a message arrives', () => {
    harness = mount(
      <EchoCard
        session={makeSession({
          topicName: '/cmd_vel',
          topicType: 'geometry_msgs/msg/Twist',
          latestMessage: {
            linear: { x: 0.5, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 1.2 },
          },
          messageCount: 1,
        })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryWaiting(harness.container)).toBeNull()
    const block = queryMessage(harness.container)
    expect(block).not.toBeNull()
    const text = block!.textContent ?? ''
    // Pretty-print: must be on multiple lines and use 2-space indent.
    expect(text).toContain('"linear"')
    expect(text).toContain('"angular"')
    expect(text).toContain('  "x": 0.5')
    expect(text.split('\n').length).toBeGreaterThan(3)
  })

  it('renders an error banner when the session is in error state', () => {
    harness = mount(
      <EchoCard
        session={makeSession({
          topicName: '/x',
          status: 'error',
          error: 'subscribe failed',
        })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    const banner = harness.container.querySelector('.echo-card-error')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('subscribe failed')
  })
})

describe('EchoCard — action buttons', () => {
  let harness: Harness | null = null
  afterEach(() => {
    unmount(harness)
    harness = null
  })

  it('listening session: shows Stop Echo + Close, no Resume', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/x', status: 'listening' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryStop(harness.container)).not.toBeNull()
    expect(queryResume(harness.container)).toBeNull()
    expect(getClose(harness.container)).toBeDefined()
  })

  it('stopped session: shows Resume Echo + Close, no Stop', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/x', status: 'stopped' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryStop(harness.container)).toBeNull()
    expect(queryResume(harness.container)).not.toBeNull()
    expect(getClose(harness.container)).toBeDefined()
  })

  it('error session: only Close (no Stop, no Resume)', () => {
    harness = mount(
      <EchoCard
        session={makeSession({
          topicName: '/x',
          status: 'error',
          error: 'oops',
        })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryStop(harness.container)).toBeNull()
    expect(queryResume(harness.container)).toBeNull()
    expect(getClose(harness.container)).toBeDefined()
  })

  it('clicking Stop Echo invokes onStop with the topic name', () => {
    const onStop = vi.fn()
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/cmd_vel', status: 'listening' })}
        onStop={onStop}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    act(() => {
      queryStop(harness!.container)!.click()
    })
    expect(onStop).toHaveBeenCalledWith('/cmd_vel')
  })

  it('clicking Resume Echo invokes onResume with the topic name', () => {
    const onResume = vi.fn()
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/cmd_vel', status: 'stopped' })}
        onStop={() => {}}
        onResume={onResume}
        onClose={() => {}}
      />,
    )
    act(() => {
      queryResume(harness!.container)!.click()
    })
    expect(onResume).toHaveBeenCalledWith('/cmd_vel')
  })

  it('Resume Echo is disabled when canResume=false', () => {
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/cmd_vel', status: 'stopped' })}
        canResume={false}
        onStop={() => {}}
        onResume={() => {}}
        onClose={() => {}}
      />,
    )
    expect(queryResume(harness.container)?.disabled).toBe(true)
  })

  it('clicking Close invokes onClose with the topic name', () => {
    const onClose = vi.fn()
    harness = mount(
      <EchoCard
        session={makeSession({ topicName: '/cmd_vel', status: 'listening' })}
        onStop={() => {}}
        onResume={() => {}}
        onClose={onClose}
      />,
    )
    act(() => {
      getClose(harness!.container).click()
    })
    expect(onClose).toHaveBeenCalledWith('/cmd_vel')
  })
})

beforeEach(() => {
  document.body.innerHTML = ''
})
