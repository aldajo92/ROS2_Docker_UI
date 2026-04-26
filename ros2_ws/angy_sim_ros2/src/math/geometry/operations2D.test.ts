import { describe, expect, it } from 'vitest'
import { Point2D } from './Point2D'
import { Vector2D } from './Vector2D'
import {
  pointAdd,
  pointDistance,
  pointSub,
  vectorAdd,
  vectorAngle,
  vectorCross,
  vectorDot,
  vectorLength,
  vectorNegate,
  vectorNormalize,
  vectorRotate,
  vectorScale,
  vectorSub,
  wrapAngle,
} from './operations2D'

describe('Vector2D operations', () => {
  it('adds and subtracts vectors component-wise', () => {
    const a = new Vector2D(1, 2)
    const b = new Vector2D(3, -1)
    expect(vectorAdd(a, b)).toEqual(new Vector2D(4, 1))
    expect(vectorSub(a, b)).toEqual(new Vector2D(-2, 3))
  })

  it('scales and negates', () => {
    const v = new Vector2D(2, -3)
    expect(vectorScale(v, 2)).toEqual(new Vector2D(4, -6))
    expect(vectorNegate(v)).toEqual(new Vector2D(-2, 3))
  })

  it('computes dot and cross products', () => {
    const a = new Vector2D(1, 2)
    const b = new Vector2D(3, 4)
    expect(vectorDot(a, b)).toBe(11)
    expect(vectorCross(a, b)).toBe(-2)
  })

  it('computes length and normalizes', () => {
    expect(vectorLength(new Vector2D(3, 4))).toBe(5)
    const n = vectorNormalize(new Vector2D(3, 4))
    expect(n.x).toBeCloseTo(0.6)
    expect(n.y).toBeCloseTo(0.8)
  })

  it('normalize(zero) returns zero (no NaN)', () => {
    expect(vectorNormalize(new Vector2D(0, 0))).toEqual(new Vector2D(0, 0))
  })

  it('vectorAngle returns atan2(y, x)', () => {
    expect(vectorAngle(new Vector2D(1, 0))).toBe(0)
    expect(vectorAngle(new Vector2D(0, 1))).toBeCloseTo(Math.PI / 2)
    expect(vectorAngle(new Vector2D(-1, 0))).toBeCloseTo(Math.PI)
  })

  it('vectorRotate by π/2 maps (1, 0) → (0, 1)', () => {
    const r = vectorRotate(new Vector2D(1, 0), Math.PI / 2)
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(1)
  })

  it('rotation is length-preserving', () => {
    const v = new Vector2D(2.5, -1.3)
    const r = vectorRotate(v, 0.7)
    expect(vectorLength(r)).toBeCloseTo(vectorLength(v))
  })
})

describe('Point2D ↔ Vector2D operations', () => {
  it('pointSub returns the displacement vector from b to a', () => {
    const a = new Point2D(5, 7)
    const b = new Point2D(2, 3)
    expect(pointSub(a, b)).toEqual(new Vector2D(3, 4))
  })

  it('pointAdd translates a point by a vector', () => {
    const p = new Point2D(1, 1)
    const v = new Vector2D(2, 3)
    expect(pointAdd(p, v)).toEqual(new Point2D(3, 4))
  })

  it('pointDistance is the Euclidean distance', () => {
    expect(pointDistance(new Point2D(0, 0), new Point2D(3, 4))).toBe(5)
    expect(pointDistance(new Point2D(1, 1), new Point2D(1, 1))).toBe(0)
  })
})

describe('wrapAngle', () => {
  it('wraps angles into [-π, π] (boundary may resolve to either side)', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(2 * Math.PI)).toBeCloseTo(0)
    expect(Math.abs(wrapAngle(Math.PI))).toBeCloseTo(Math.PI)
    expect(Math.abs(wrapAngle(-Math.PI))).toBeCloseTo(Math.PI)
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI)
    expect(wrapAngle(Math.PI + 0.1)).toBeCloseTo(-Math.PI + 0.1)
    expect(wrapAngle(-0.5)).toBeCloseTo(-0.5)
    expect(wrapAngle(0.5)).toBeCloseTo(0.5)
  })
})
