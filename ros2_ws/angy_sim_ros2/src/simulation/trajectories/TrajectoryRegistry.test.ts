import { beforeEach, describe, expect, it } from 'vitest'
import { TrajectoryRegistry } from './TrajectoryRegistry'

describe('TrajectoryRegistry', () => {
  let registry: TrajectoryRegistry

  beforeEach(() => {
    registry = new TrajectoryRegistry()
  })

  it('starts empty', () => {
    expect(registry.size()).toBe(0)
    expect(registry.toArray()).toEqual([])
  })

  it('ensure creates a trajectory entry', () => {
    registry.ensure('ego')
    expect(registry.has('ego')).toBe(true)
    expect(registry.get('ego')).toEqual({ entityId: 'ego', samples: [] })
  })

  it('append adds samples', () => {
    registry.append('ego', { timeSec: 1, x: 1, y: 2, yaw: 0.3 }, 10)
    registry.append('ego', { timeSec: 2, x: 2, y: 3 }, 10)
    expect(registry.get('ego')?.samples).toEqual([
      { timeSec: 1, x: 1, y: 2, yaw: 0.3 },
      { timeSec: 2, x: 2, y: 3 },
    ])
  })

  it('append enforces maxSamples', () => {
    registry.append('ego', { timeSec: 1, x: 1, y: 1 }, 2)
    registry.append('ego', { timeSec: 2, x: 2, y: 2 }, 2)
    registry.append('ego', { timeSec: 3, x: 3, y: 3 }, 2)
    expect(registry.get('ego')?.samples).toEqual([
      { timeSec: 2, x: 2, y: 2 },
      { timeSec: 3, x: 3, y: 3 },
    ])
  })

  it('pruneOlderThan removes old samples', () => {
    registry.append('ego', { timeSec: 1, x: 1, y: 1 }, 10)
    registry.append('ego', { timeSec: 2, x: 2, y: 2 }, 10)
    registry.append('ego', { timeSec: 3, x: 3, y: 3 }, 10)
    registry.pruneOlderThan('ego', 2)
    expect(registry.get('ego')?.samples).toEqual([
      { timeSec: 2, x: 2, y: 2 },
      { timeSec: 3, x: 3, y: 3 },
    ])
  })

  it('clear removes one entity when id provided', () => {
    registry.append('ego', { timeSec: 1, x: 1, y: 1 }, 10)
    registry.append('actor', { timeSec: 1, x: 5, y: 5 }, 10)
    registry.clear('ego')
    expect(registry.has('ego')).toBe(false)
    expect(registry.has('actor')).toBe(true)
  })

  it('clear removes all entities when id is omitted', () => {
    registry.append('ego', { timeSec: 1, x: 1, y: 1 }, 10)
    registry.append('actor', { timeSec: 1, x: 5, y: 5 }, 10)
    registry.clear()
    expect(registry.size()).toBe(0)
  })

  it('toArray returns defensive copies', () => {
    registry.append('ego', { timeSec: 1, x: 1, y: 1, speed: 0.2 }, 10)
    const snapshot = registry.toArray()
    snapshot[0].samples[0].x = 999
    expect(registry.get('ego')?.samples[0].x).toBe(1)
  })

  it('preserves insertion order', () => {
    registry.append('b', { timeSec: 1, x: 1, y: 1 }, 10)
    registry.append('a', { timeSec: 1, x: 2, y: 2 }, 10)
    registry.append('c', { timeSec: 1, x: 3, y: 3 }, 10)
    expect(registry.toArray().map((entry) => entry.entityId)).toEqual([
      'b',
      'a',
      'c',
    ])
  })
})
