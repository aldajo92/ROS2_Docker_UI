import { describe, expect, it } from 'vitest'
import { collisionPairKey } from './CollisionPairKey'

describe('collisionPairKey', () => {
  it('is order-independent', () => {
    expect(collisionPairKey('a', 'b')).toBe(collisionPairKey('b', 'a'))
  })

  it('uses lexicographic ordering with a "|" separator', () => {
    expect(collisionPairKey('b', 'a')).toBe('a|b')
    expect(collisionPairKey('z9', 'z10')).toBe('z10|z9') // string compare, not numeric
  })

  it('produces stable keys across calls', () => {
    const k1 = collisionPairKey('vehicle-1', 'obstacle-2')
    const k2 = collisionPairKey('obstacle-2', 'vehicle-1')
    expect(k1).toBe(k2)
    expect(k1).toBe('obstacle-2|vehicle-1')
  })

  it('handles equal ids without throwing (degenerate case)', () => {
    expect(collisionPairKey('x', 'x')).toBe('x|x')
  })
})
