import { describe, expect, it, vi } from 'vitest'
import { InMemoryTransport } from './InMemoryTransport'

describe('InMemoryTransport', () => {
  it('refuses to publish while disconnected', async () => {
    const t = new InMemoryTransport()
    await expect(t.publish('topic', 1)).rejects.toThrow()
  })

  it('delivers asynchronously, never synchronously inside publish()', async () => {
    const t = new InMemoryTransport()
    await t.connect()
    const handler = vi.fn()
    t.subscribe('topic', handler)

    // Don't await yet — the synchronous body of publish() must not
    // dispatch to handlers before the microtask queue drains.
    const pending = t.publish('topic', 'hello')
    expect(handler).not.toHaveBeenCalled()

    await pending
    await Promise.resolve()
    expect(handler).toHaveBeenCalledWith('hello')
  })

  it('clears subscriptions on disconnect', async () => {
    const t = new InMemoryTransport()
    await t.connect()
    const handler = vi.fn()
    t.subscribe('topic', handler)

    await t.disconnect()
    await t.connect()

    await t.publish('topic', 1)
    await Promise.resolve()
    expect(handler).not.toHaveBeenCalled()
  })

  it('honors unsubscribe between publish() and microtask drain', async () => {
    const t = new InMemoryTransport()
    await t.connect()
    const handler = vi.fn()
    const unsub = t.subscribe('topic', handler)

    await t.publish('topic', 1)
    // We snapshot subscribers at publish time on purpose: once
    // dispatch is queued, it should still deliver.
    unsub()
    await Promise.resolve()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
