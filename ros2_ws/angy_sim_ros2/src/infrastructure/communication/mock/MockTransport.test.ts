import { describe, expect, it, vi } from 'vitest'
import { MockTransport } from './MockTransport'

describe('MockTransport', () => {
  it('starts disconnected and refuses to publish', async () => {
    const t = new MockTransport()
    expect(t.isConnected()).toBe(false)
    await expect(t.publish('topic', { x: 1 })).rejects.toThrow()
  })

  it('publishes synchronously to subscribers after connect', async () => {
    const t = new MockTransport()
    await t.connect()

    const handler = vi.fn()
    t.subscribe('greetings', handler)
    await t.publish('greetings', { msg: 'hi' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ msg: 'hi' })
  })

  it('isolates topics from each other', async () => {
    const t = new MockTransport()
    await t.connect()
    const a = vi.fn()
    const b = vi.fn()
    t.subscribe('a', a)
    t.subscribe('b', b)
    await t.publish('a', 1)
    expect(a).toHaveBeenCalledWith(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('returns an idempotent unsubscribe function', async () => {
    const t = new MockTransport()
    await t.connect()
    const handler = vi.fn()
    const unsub = t.subscribe('x', handler)

    await t.publish('x', 1)
    unsub()
    unsub() // calling twice must not throw
    await t.publish('x', 2)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('keeps subscriptions across disconnect/reconnect (documented behavior)', async () => {
    const t = new MockTransport()
    await t.connect()
    const handler = vi.fn()
    t.subscribe('topic', handler)

    await t.disconnect()
    await t.connect()
    await t.publish('topic', 1)

    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('records every published message for later assertion', async () => {
    const t = new MockTransport()
    await t.connect()
    await t.publish('a', 1)
    await t.publish('b', 'two')
    expect(t.published).toEqual([
      { topic: 'a', message: 1 },
      { topic: 'b', message: 'two' },
    ])
  })

  it('does not let one bad subscriber stop the others', async () => {
    const t = new MockTransport()
    await t.connect()

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const good = vi.fn()
    t.subscribe('topic', () => {
      throw new Error('boom')
    })
    t.subscribe('topic', good)

    await t.publish('topic', 'payload')
    expect(good).toHaveBeenCalledWith('payload')
    errSpy.mockRestore()
  })
})
