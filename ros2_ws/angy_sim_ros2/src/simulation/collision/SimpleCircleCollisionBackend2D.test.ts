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

})

describe('SimpleCircleCollisionBackend2D — circle vs oriented_box', () => {
  const backend = new SimpleCircleCollisionBackend2D()

  function axisAlignedBox(
    id: string,
    x: number,
    y: number,
    width: number,
    length: number,
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

  it('detects a circle touching the edge of an axis-aligned box', () => {
    const box = axisAlignedBox('box', 0, 0, /*width*/ 2, /*length*/ 1)
    // Box extends X: [-1, 1], Y: [-0.5, 0.5].
    // Place circle tangent to the +X edge.
    const c = circle('c', 1.5, 0, 0.5)
    const contacts = backend.detect([box, c])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].entityAId).toBe('box')
    expect(contacts[0].entityBId).toBe('c')
    expect(contacts[0].penetrationDepth).toBeCloseTo(0)
    // Normal points from box outward to circle (+X).
    expect(contacts[0].normal!.x).toBeCloseTo(1)
    expect(contacts[0].normal!.y).toBeCloseTo(0)
  })

  it('reports correct penetration when a circle overlaps the box edge', () => {
    const box = axisAlignedBox('box', 0, 0, 2, 1)
    const c = circle('c', 1.2, 0, 0.5)
    const contacts = backend.detect([box, c])
    expect(contacts).toHaveLength(1)
    // Closest point on box is (1, 0); distance to circle center (1.2, 0) = 0.2.
    // Penetration = r - distance = 0.3.
    expect(contacts[0].penetrationDepth).toBeCloseTo(0.3)
    expect(contacts[0].normal!.x).toBeCloseTo(1)
    expect(contacts[0].normal!.y).toBeCloseTo(0)
  })

  it('does not report a contact when circle is clearly outside', () => {
    const box = axisAlignedBox('box', 0, 0, 2, 1)
    const c = circle('c', 5, 5, 0.1)
    expect(backend.detect([box, c])).toEqual([])
  })

  it('handles a circle whose center is inside the box', () => {
    // Long thin box in X: width = 2 (X ∈ [-1, 1]), length = 4 (Y ∈
    // [-2, 2]). Circle center at (0.5, 0) ⇒ closest face is +X at
    // distance 0.5; top/bottom faces are 2 away.
    const box = axisAlignedBox('box', 0, 0, 2, 4)
    const c = circle('c', 0.5, 0, 0.1)
    const contacts = backend.detect([box, c])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].normal!.x).toBeCloseTo(1)
    expect(contacts[0].normal!.y).toBeCloseTo(0)
    // Penetration = r + escapeDistance = 0.1 + 0.5 = 0.6.
    expect(contacts[0].penetrationDepth).toBeCloseTo(0.6)
  })

  it('rotates the contact normal for a yawed box', () => {
    const box = axisAlignedBox('box', 0, 0, 2, 1, Math.PI / 2)
    // With yaw = π/2, the box is rotated 90° CCW: its world-space X
    // extent becomes ±0.5 (the original length), Y extent ±1 (the
    // original width). Place the circle just outside the world +Y face.
    const c = circle('c', 0, 1.2, 0.3)
    const contacts = backend.detect([box, c])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].normal!.x).toBeCloseTo(0)
    expect(contacts[0].normal!.y).toBeCloseTo(1)
    expect(contacts[0].penetrationDepth).toBeCloseTo(0.1)
  })

  it('reports the reverse ordering when the circle comes first in the input', () => {
    const box = axisAlignedBox('box', 0, 0, 2, 1)
    const c = circle('c', 1.2, 0, 0.5)
    const contacts = backend.detect([c, box])
    expect(contacts[0].entityAId).toBe('c')
    expect(contacts[0].entityBId).toBe('box')
    // Normal flips: circle → box means −X.
    expect(contacts[0].normal!.x).toBeCloseTo(-1)
    expect(contacts[0].normal!.y).toBeCloseTo(0)
    expect(contacts[0].penetrationDepth).toBeCloseTo(0.3)
  })
})

describe('SimpleCircleCollisionBackend2D — oriented_box vs oriented_box (SAT)', () => {
  const backend = new SimpleCircleCollisionBackend2D()

  function axisAlignedBox(
    id: string,
    x: number,
    y: number,
    width: number,
    length: number,
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

  it('detects two overlapping axis-aligned boxes', () => {
    const a = axisAlignedBox('a', 0, 0, 2, 2)
    const b = axisAlignedBox('b', 1.5, 0, 2, 2)
    const contacts = backend.detect([a, b])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].entityAId).toBe('a')
    expect(contacts[0].entityBId).toBe('b')
    // Overlap along X is 0.5; along Y is 2 — SAT picks X.
    expect(contacts[0].penetrationDepth).toBeCloseTo(0.5)
    expect(contacts[0].normal!.x).toBeCloseTo(1)
    expect(contacts[0].normal!.y).toBeCloseTo(0)
  })

  it('does not report contact when axis-aligned boxes are separated', () => {
    const a = axisAlignedBox('a', 0, 0, 1, 1)
    const b = axisAlignedBox('b', 5, 0, 1, 1)
    expect(backend.detect([a, b])).toEqual([])
  })

  it('detects overlap for a rotated pair of boxes', () => {
    const a = axisAlignedBox('a', 0, 0, 2, 2)
    const b = axisAlignedBox('b', 1.5, 1.5, 2, 2, Math.PI / 4)
    const contacts = backend.detect([a, b])
    expect(contacts).toHaveLength(1)
    expect(contacts[0].penetrationDepth).toBeGreaterThan(0)
  })

  it('finds a separating axis for two rotated non-overlapping boxes', () => {
    const a = axisAlignedBox('a', 0, 0, 1, 1)
    const b = axisAlignedBox('b', 3, 0, 1, 1, Math.PI / 4)
    expect(backend.detect([a, b])).toEqual([])
  })
})
