import { describe, expect, it } from 'vitest'
import { NoopCollisionBackend2D } from './NoopCollisionBackend2D'
import type {
  CircleCollisionShape2D,
  CollisionShape2D,
  OrientedBoxCollisionShape2D,
} from './CollisionShape2D'

function circle(
  id: string,
  x: number,
  y: number,
  radius: number,
): CircleCollisionShape2D {
  return { type: 'circle', entityId: id, center: { x, y }, radius }
}

function box(
  id: string,
  x: number,
  y: number,
  length: number,
  width: number,
  yaw = 0,
): OrientedBoxCollisionShape2D {
  return {
    type: 'oriented_box',
    entityId: id,
    pose: { x, y, yaw },
    length,
    width,
  }
}

describe('NoopCollisionBackend2D', () => {
  it('exposes a stable name', () => {
    expect(new NoopCollisionBackend2D().name).toBe('NoopCollisionBackend2D')
  })

  it('detect([]) returns []', () => {
    expect(new NoopCollisionBackend2D().detect([])).toEqual([])
  })

  it('detect([...overlapping shapes]) still returns []', () => {
    const backend = new NoopCollisionBackend2D()
    const shapes: CollisionShape2D[] = [
      circle('a', 0, 0, 1),
      circle('b', 0.5, 0, 1),
      box('c', 0, 0, 2, 1),
    ]
    expect(backend.detect(shapes)).toEqual([])
  })

  it('does not mutate the input array or shapes', () => {
    const backend = new NoopCollisionBackend2D()
    const a = circle('a', 0, 0, 1)
    const b = circle('b', 0, 0, 1)
    const shapes: CollisionShape2D[] = [a, b]
    const snapshot = JSON.stringify(shapes)
    backend.detect(shapes)
    expect(shapes).toHaveLength(2)
    expect(JSON.stringify(shapes)).toBe(snapshot)
  })

  it('reset() does not throw', () => {
    const backend = new NoopCollisionBackend2D()
    expect(() => backend.reset()).not.toThrow()
  })

  it('dispose() does not throw', () => {
    const backend = new NoopCollisionBackend2D()
    expect(() => backend.dispose()).not.toThrow()
  })
})
