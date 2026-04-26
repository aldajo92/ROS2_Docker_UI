import { describe, it, expect, beforeEach } from 'vitest'
import { PathRegistry } from './PathRegistry'
import type { Path2D } from './Path2D'

function makePath(id: string, overrides: Partial<Path2D> = {}): Path2D {
  return {
    id,
    points: [{ x: 0, y: 0 }],
    ...overrides,
  }
}

describe('PathRegistry', () => {
  let registry: PathRegistry

  beforeEach(() => {
    registry = new PathRegistry()
  })

  it('starts empty', () => {
    expect(registry.size()).toBe(0)
    expect(registry.toArray()).toEqual([])
  })

  it('adds and retrieves a path by id', () => {
    const path = makePath('a')
    registry.add(path)
    expect(registry.get('a')).toBe(path)
    expect(registry.has('a')).toBe(true)
  })

  it('returns undefined for unknown id', () => {
    expect(registry.get('missing')).toBeUndefined()
    expect(registry.has('missing')).toBe(false)
  })

  it('size increments on add', () => {
    registry.add(makePath('a'))
    expect(registry.size()).toBe(1)
    registry.add(makePath('b'))
    expect(registry.size()).toBe(2)
  })

  it('remove decrements size and removes entry', () => {
    registry.add(makePath('a'))
    registry.remove('a')
    expect(registry.size()).toBe(0)
    expect(registry.has('a')).toBe(false)
    expect(registry.get('a')).toBeUndefined()
  })

  it('remove of unknown id is a no-op', () => {
    registry.add(makePath('a'))
    registry.remove('nonexistent')
    expect(registry.size()).toBe(1)
  })

  it('replacing same id updates the entry', () => {
    const first = makePath('a', { name: 'first' })
    const second = makePath('a', { name: 'second' })
    registry.add(first)
    registry.add(second)
    expect(registry.size()).toBe(1)
    expect(registry.get('a')?.name).toBe('second')
  })

  it('toArray preserves insertion order', () => {
    registry.add(makePath('a'))
    registry.add(makePath('b'))
    registry.add(makePath('c'))
    const ids = registry.toArray().map((p) => p.id)
    expect(ids).toEqual(['a', 'b', 'c'])
  })

  it('clear empties the registry', () => {
    registry.add(makePath('a'))
    registry.add(makePath('b'))
    registry.clear()
    expect(registry.size()).toBe(0)
    expect(registry.toArray()).toEqual([])
  })

  it('toArray returns a snapshot, not the internal map', () => {
    registry.add(makePath('a'))
    const arr = registry.toArray()
    registry.add(makePath('b'))
    expect(arr).toHaveLength(1)
  })
})
