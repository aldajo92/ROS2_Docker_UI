import { describe, expect, it } from 'vitest'
import {
  Line,
  Point2D,
  Point3D,
  add,
  distance,
  equals,
  scale,
  sub,
} from '../models/SimBase'

describe('Point2D', () => {
  it('stores x, y and forces z = 0', () => {
    const p = new Point2D(1, 2)
    expect(p.x).toBe(1)
    expect(p.y).toBe(2)
    expect(p.z).toBe(0)
  })

  it('accepts negative and fractional coordinates', () => {
    const p = new Point2D(-1.5, 2.25)
    expect(p.x).toBe(-1.5)
    expect(p.y).toBe(2.25)
    expect(p.z).toBe(0)
  })

  it('formats as "(x, y)" via toString', () => {
    expect(new Point2D(1, -2).toString()).toBe('(1, -2)')
  })
})

describe('Point3D', () => {
  it('stores x, y, z', () => {
    const p = new Point3D(1, 2, 3)
    expect(p.x).toBe(1)
    expect(p.y).toBe(2)
    expect(p.z).toBe(3)
  })

  it('accepts negative and fractional coordinates', () => {
    const p = new Point3D(-1.5, 0, 2.25)
    expect(p.x).toBe(-1.5)
    expect(p.y).toBe(0)
    expect(p.z).toBe(2.25)
  })

  it('formats as "(x, y, z)" via toString', () => {
    expect(new Point3D(1, 2, 3).toString()).toBe('(1, 2, 3)')
  })
})

describe('equals', () => {
  it('is true for identical 3D points', () => {
    expect(equals(new Point3D(1, 2, 3), new Point3D(1, 2, 3))).toBe(true)
  })

  it('is false for differing components', () => {
    expect(equals(new Point3D(1, 2, 3), new Point3D(1, 2, 4))).toBe(false)
    expect(equals(new Point3D(1, 2, 3), new Point3D(0, 2, 3))).toBe(false)
    expect(equals(new Point3D(1, 2, 3), new Point3D(1, 0, 3))).toBe(false)
  })

  it('treats points within eps as equal', () => {
    const a = new Point3D(1, 1, 1)
    const b = new Point3D(1 + 1e-10, 1 - 1e-10, 1)
    expect(equals(a, b)).toBe(true)
  })

  it('respects a custom eps', () => {
    const a = new Point3D(0, 0, 0)
    const b = new Point3D(0.005, 0, 0)
    expect(equals(a, b)).toBe(false)
    expect(equals(a, b, 0.01)).toBe(true)
  })

  it('treats Point2D and Point3D as equal when z is 0', () => {
    expect(equals(new Point2D(1, 2), new Point3D(1, 2, 0))).toBe(true)
  })
})

describe('add', () => {
  it('sums each component', () => {
    expect(
      equals(
        add(new Point3D(1, 2, 3), new Point3D(4, 5, 6)),
        new Point3D(5, 7, 9),
      ),
    ).toBe(true)
  })

  it('handles negative components', () => {
    expect(
      equals(
        add(new Point3D(1, 2, 3), new Point3D(-1, -2, -3)),
        new Point3D(0, 0, 0),
      ),
    ).toBe(true)
  })

  it('mixes Point2D and Point3D operands (2D contributes z = 0)', () => {
    const r = add(new Point2D(1, 2), new Point3D(0, 0, 5))
    expect(equals(r, new Point3D(1, 2, 5))).toBe(true)
  })

  it('returns a new Point3D and does not mutate either operand', () => {
    const a = new Point3D(1, 2, 3)
    const b = new Point3D(4, 5, 6)
    const r = add(a, b)
    expect(r).toBeInstanceOf(Point3D)
    expect(r).not.toBe(a)
    expect(r).not.toBe(b)
    expect(equals(a, new Point3D(1, 2, 3))).toBe(true)
    expect(equals(b, new Point3D(4, 5, 6))).toBe(true)
  })
})

describe('sub', () => {
  it('subtracts each component', () => {
    expect(
      equals(
        sub(new Point3D(5, 7, 9), new Point3D(1, 2, 3)),
        new Point3D(4, 5, 6),
      ),
    ).toBe(true)
  })

  it('sub(a, a) is the origin', () => {
    const a = new Point3D(3, -2, 5)
    expect(equals(sub(a, a), new Point3D(0, 0, 0))).toBe(true)
  })

  it('does not mutate operands', () => {
    const a = new Point3D(1, 2, 3)
    const b = new Point3D(0, 1, 0)
    sub(a, b)
    expect(equals(a, new Point3D(1, 2, 3))).toBe(true)
    expect(equals(b, new Point3D(0, 1, 0))).toBe(true)
  })
})

describe('scale', () => {
  it('multiplies every component by s', () => {
    expect(equals(scale(new Point3D(1, -2, 3), 2), new Point3D(2, -4, 6))).toBe(
      true,
    )
  })

  it('scaling by 0 produces the origin', () => {
    expect(equals(scale(new Point3D(1, 2, 3), 0), new Point3D(0, 0, 0))).toBe(
      true,
    )
  })

  it('scaling by 1 produces an equal point', () => {
    const a = new Point3D(1.5, -3.25, 0.5)
    expect(equals(scale(a, 1), a)).toBe(true)
  })

  it('scaling by -1 negates each component', () => {
    expect(equals(scale(new Point3D(1, 2, 3), -1), new Point3D(-1, -2, -3))).toBe(
      true,
    )
  })

  it('scales a Point2D and returns a Point3D with z = 0', () => {
    const r = scale(new Point2D(2, 3), 4)
    expect(r).toBeInstanceOf(Point3D)
    expect(equals(r, new Point3D(8, 12, 0))).toBe(true)
  })

  it('does not mutate the original', () => {
    const a = new Point3D(1, 2, 3)
    scale(a, 10)
    expect(equals(a, new Point3D(1, 2, 3))).toBe(true)
  })
})

describe('distance', () => {
  it('is 0 from a point to itself', () => {
    const a = new Point3D(1, 2, 3)
    expect(distance(a, a)).toBe(0)
  })

  it('is symmetric', () => {
    const a = new Point3D(1, 2, 3)
    const b = new Point3D(4, 6, 8)
    expect(distance(a, b)).toBeCloseTo(distance(b, a), 12)
  })

  it('is the Euclidean norm in 2D (3-4-5 triangle)', () => {
    expect(distance(new Point2D(0, 0), new Point2D(3, 4))).toBe(5)
  })

  it('is the Euclidean norm in 3D', () => {
    // sqrt(2^2 + 3^2 + 6^2) = sqrt(49) = 7
    expect(distance(new Point3D(0, 0, 0), new Point3D(2, 3, 6))).toBe(7)
  })

  it('handles negative coordinates', () => {
    expect(
      distance(new Point3D(-1, -1, -1), new Point3D(1, 1, 1)),
    ).toBeCloseTo(Math.sqrt(12), 12)
  })
})

describe('Line', () => {
  it('stores its endpoints', () => {
    const p = new Point3D(0, 0, 0)
    const q = new Point3D(1, 1, 1)
    const l = new Line(p, q)
    expect(l).toBeInstanceOf(Line)
    expect(l.p).toBe(p)
    expect(l.q).toBe(q)
  })

  it('accepts mixed 2D/3D endpoints', () => {
    const l = new Line(new Point2D(1, 2), new Point3D(3, 4, 5))
    expect(l.p).toBeInstanceOf(Point2D)
    expect(l.q).toBeInstanceOf(Point3D)
  })
})
