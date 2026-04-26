import { describe, expect, it } from 'vitest'
import { SimpleCircleCollisionBackend2D } from './SimpleCircleCollisionBackend2D'
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

describe('SimpleCircleCollisionBackend2D', () => {
  const backend = new SimpleCircleCollisionBackend2D()

  it('detects two overlapping circles', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 1, 0, 1)])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].entityAId).toBe('a')
    expect(contacts[0].entityBId).toBe('b')
  })

  it('does not detect separated circles (distance > rA + rB)', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 5, 0, 1)])
    expect(contacts).toEqual([])
  })

  it('treats touching circles (distance == rA + rB) as in contact', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 2, 0, 1)])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].penetrationDepth).toBeCloseTo(0)
  })

  it('reports penetration depth as rA + rB - distance', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 1.2, 0, 1)])
    expect(contacts[0].penetrationDepth).toBeCloseTo(0.8)
  })

  it('reports a unit normal pointing from A toward B', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 0.5, 0, 1)])
    const n = contacts[0].normal!
    expect(n.x).toBeCloseTo(1)
    expect(n.y).toBeCloseTo(0)
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1)
  })

  it('handles same-center circles with a deterministic fallback normal', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 0, 0, 1)])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].normal).toEqual({ x: 1, y: 0 })
    expect(contacts[0].penetrationDepth).toBeCloseTo(2)
  })

  it('produces a deterministic pair iteration order', () => {
    const shapes = [
      circle('c', 0, 0, 1),
      circle('a', 0.5, 0, 1),
      circle('b', -0.5, 0, 1),
    ]
    const ordering = backend.detect(shapes).map((c) => [c.entityAId, c.entityBId])
    expect(ordering).toEqual([
      ['c', 'a'],
      ['c', 'b'],
      ['a', 'b'],
    ])
  })

  it('does not mutate input shapes', () => {
    const shapes: readonly CollisionShape2D[] = [
      circle('a', 0, 0, 1),
      circle('b', 1, 0, 1),
    ]
    const snapshot = JSON.parse(JSON.stringify(shapes))
    backend.detect(shapes)
    expect(JSON.parse(JSON.stringify(shapes))).toEqual(snapshot)
  })

  it('silently ignores oriented_box shapes (not implemented in simple backend)', () => {
    const box: OrientedBoxCollisionShape2D = {
      type: 'oriented_box',
      entityId: 'box',
      pose: { x: 0, y: 0, yaw: 0 },
      length: 2,
      width: 1,
    }
    const contacts = backend.detect([box, circle('c', 0, 0, 0.1)])
    expect(contacts).toEqual([])
  })
})
