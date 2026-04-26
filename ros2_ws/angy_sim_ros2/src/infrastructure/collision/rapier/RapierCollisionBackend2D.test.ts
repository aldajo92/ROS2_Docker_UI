import { beforeAll, describe, expect, it } from 'vitest'
import { RapierCollisionBackend2D } from './RapierCollisionBackend2D'
import type {
  CircleCollisionShape2D,
  CollisionShape2D,
  OrientedBoxCollisionShape2D,
} from '../../../simulation/collision/CollisionShape2D'
import { collisionPairKey } from '../../../simulation/collision/CollisionPairKey'

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
  yaw: number,
  length: number,
  width: number,
): OrientedBoxCollisionShape2D {
  return {
    type: 'oriented_box',
    entityId: id,
    pose: { x, y, yaw },
    length,
    width,
  }
}

describe('RapierCollisionBackend2D', () => {
  let backend: RapierCollisionBackend2D

  beforeAll(async () => {
    backend = await RapierCollisionBackend2D.create()
  })

  it('create() initializes Rapier successfully', () => {
    expect(backend.name).toBe('RapierCollisionBackend2D')
  })

  it('returns no contacts for an empty input', () => {
    expect(backend.detect([])).toEqual([])
  })

  it('detects two overlapping circles', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 1, 0, 1)])
    expect(contacts).toHaveLength(1)
    const ids = [contacts[0].entityAId, contacts[0].entityBId].sort()
    expect(ids).toEqual(['a', 'b'])
  })

  it('does not report separated circles as in contact', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 5, 0, 1)])
    expect(contacts).toEqual([])
  })

  it('detects a circle vs an oriented box overlap', () => {
    const contacts = backend.detect([
      circle('c', 0, 0, 0.4),
      box('rect', 0, 0, 0, 2, 1),
    ])
    expect(contacts).toHaveLength(1)
    const key = collisionPairKey(contacts[0].entityAId, contacts[0].entityBId)
    expect(key).toBe(collisionPairKey('c', 'rect'))
  })

  it('detects oriented_box vs oriented_box overlap', () => {
    const contacts = backend.detect([
      box('a', 0, 0, 0, 1, 1),
      box('b', 0.4, 0, 0, 1, 1),
    ])
    expect(contacts).toHaveLength(1)
  })

  it('reports each pair only once (no symmetric duplicates)', () => {
    const contacts = backend.detect([
      circle('a', 0, 0, 0.5),
      circle('b', 0.5, 0, 0.5),
      circle('c', 0.25, 0, 0.5),
    ])
    const keys = contacts.map((c) =>
      collisionPairKey(c.entityAId, c.entityBId),
    )
    expect(new Set(keys).size).toBe(keys.length)
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

  it('uses simulation X/Y directly (no axis remap)', () => {
    // Two circles separated only along simulation +Y. If the backend
    // were accidentally swapping Y for Z (Three.js style), this would
    // collapse to the same point and report a contact at distance 0.
    const contacts = backend.detect([
      circle('a', 0, 0, 0.4),
      circle('b', 0, 5, 0.4),
    ])
    expect(contacts).toEqual([])
  })

  it('reports a finite penetration depth for an obvious overlap', () => {
    const contacts = backend.detect([circle('a', 0, 0, 1), circle('b', 1, 0, 1)])
    expect(contacts).toHaveLength(1)
    if (contacts[0].penetrationDepth !== undefined) {
      expect(contacts[0].penetrationDepth).toBeGreaterThan(0)
      expect(Number.isFinite(contacts[0].penetrationDepth)).toBe(true)
    }
  })
})
