import { describe, expect, it } from 'vitest'
import { ExternalPathUpdateQueue } from './ExternalPathUpdateQueue'
import type { Path2D } from './Path2D'

function makePath(id: string, n: number = 1): Path2D {
  return {
    id,
    points: Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  }
}

describe('ExternalPathUpdateQueue — basics', () => {
  it('enqueueUpsert + drain returns the path', () => {
    const q = new ExternalPathUpdateQueue()
    const path = makePath('/a')
    q.enqueueUpsert(path)
    expect(q.hasPending()).toBe(true)
    const out = q.drain()
    expect(out).toEqual([{ kind: 'upsert', path }])
    expect(q.hasPending()).toBe(false)
  })

  it('enqueueRemove + drain returns the remove entry', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueRemove('/a')
    const out = q.drain()
    expect(out).toEqual([{ kind: 'remove', id: '/a' }])
  })

  it('drain on an empty queue returns []', () => {
    const q = new ExternalPathUpdateQueue()
    expect(q.drain()).toEqual([])
  })

  it('clear drops pending updates without applying them', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueUpsert(makePath('/a'))
    q.clear()
    expect(q.hasPending()).toBe(false)
    expect(q.drain()).toEqual([])
  })
})

describe('ExternalPathUpdateQueue — coalescing', () => {
  it('keeps only the latest upsert per id between drains', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueUpsert(makePath('/a', 1))
    q.enqueueUpsert(makePath('/a', 5))
    const out = q.drain()
    expect(out).toHaveLength(1)
    expect(out[0]).toEqual({ kind: 'upsert', path: makePath('/a', 5) })
  })

  it('a remove following an upsert wins', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueUpsert(makePath('/a'))
    q.enqueueRemove('/a')
    expect(q.drain()).toEqual([{ kind: 'remove', id: '/a' }])
  })

  it('an upsert following a remove wins', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueRemove('/a')
    q.enqueueUpsert(makePath('/a'))
    expect(q.drain()).toEqual([{ kind: 'upsert', path: makePath('/a') }])
  })

  it('preserves insertion order across distinct ids', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueUpsert(makePath('/a'))
    q.enqueueUpsert(makePath('/b'))
    q.enqueueRemove('/c')
    const out = q.drain()
    expect(out.map((u) => (u.kind === 'remove' ? u.id : u.path.id))).toEqual([
      '/a',
      '/b',
      '/c',
    ])
  })

  it('re-touching an id moves it to the end of insertion order', () => {
    const q = new ExternalPathUpdateQueue()
    q.enqueueUpsert(makePath('/a'))
    q.enqueueUpsert(makePath('/b'))
    q.enqueueUpsert(makePath('/a', 99))
    const out = q.drain()
    expect(out.map((u) => (u.kind === 'remove' ? u.id : u.path.id))).toEqual([
      '/b',
      '/a',
    ])
  })
})

describe('ExternalPathUpdateQueue — input hardening', () => {
  it('enqueueUpsert rejects a path without an id', () => {
    const q = new ExternalPathUpdateQueue()
    expect(() => q.enqueueUpsert({ id: '', points: [] })).toThrow(
      /path\.id must be a non-empty string/,
    )
  })

  it('enqueueRemove rejects an empty id', () => {
    const q = new ExternalPathUpdateQueue()
    expect(() => q.enqueueRemove('')).toThrow(
      /id must be a non-empty string/,
    )
  })
})
