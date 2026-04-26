import { Point2D } from './Point2D'
import { Vector2D } from './Vector2D'
import { Segment2D } from './Segment2D'

/* -- factories ------------------------------------------------------------ */

export const point2 = (x: number, y: number): Point2D => new Point2D(x, y)
export const vec2 = (x: number, y: number): Vector2D => new Vector2D(x, y)

/* -- vector ↔ vector ----------------------------------------------------- */

export const vectorAdd = (a: Vector2D, b: Vector2D): Vector2D =>
  new Vector2D(a.x + b.x, a.y + b.y)

export const vectorSub = (a: Vector2D, b: Vector2D): Vector2D =>
  new Vector2D(a.x - b.x, a.y - b.y)

export const vectorScale = (v: Vector2D, s: number): Vector2D =>
  new Vector2D(v.x * s, v.y * s)

export const vectorNegate = (v: Vector2D): Vector2D => new Vector2D(-v.x, -v.y)

export const vectorDot = (a: Vector2D, b: Vector2D): number => a.x * b.x + a.y * b.y

/** 2D "cross product" — returns the scalar z component of the 3D cross. */
export const vectorCross = (a: Vector2D, b: Vector2D): number => a.x * b.y - a.y * b.x

export const vectorLength = (v: Vector2D): number => Math.hypot(v.x, v.y)

export const vectorLengthSq = (v: Vector2D): number => v.x * v.x + v.y * v.y

export const vectorNormalize = (v: Vector2D): Vector2D => {
  const len = vectorLength(v)
  if (len === 0) return new Vector2D(0, 0)
  return new Vector2D(v.x / len, v.y / len)
}

export const vectorAngle = (v: Vector2D): number => Math.atan2(v.y, v.x)

export const vectorRotate = (v: Vector2D, rad: number): Vector2D => {
  const c = Math.cos(rad)
  const s = Math.sin(rad)
  return new Vector2D(v.x * c - v.y * s, v.x * s + v.y * c)
}

export const vectorEquals = (a: Vector2D, b: Vector2D, epsilon = 0): boolean => {
  if (epsilon === 0) return a.x === b.x && a.y === b.y
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon
}

/* -- point ↔ vector ------------------------------------------------------ */

export const pointAdd = (p: Point2D, v: Vector2D): Point2D =>
  new Point2D(p.x + v.x, p.y + v.y)

export const pointSubVector = (p: Point2D, v: Vector2D): Point2D =>
  new Point2D(p.x - v.x, p.y - v.y)

/** Vector from `b` to `a`: `a - b`. */
export const pointSub = (a: Point2D, b: Point2D): Vector2D =>
  new Vector2D(a.x - b.x, a.y - b.y)

export const pointDistance = (a: Point2D, b: Point2D): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

export const pointDistanceSq = (a: Point2D, b: Point2D): number => {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/* -- angles --------------------------------------------------------------- */

/**
 * Wrap an angle into the (-π, π] interval.
 *
 * Implemented as `atan2(sin x, cos x)` rather than modular arithmetic
 * because that one-liner gives the correct boundary behavior (both ±π
 * land on +π) without any branchy bookkeeping.
 */
export const wrapAngle = (rad: number): number =>
  Math.atan2(Math.sin(rad), Math.cos(rad))

/* -- segment helpers ------------------------------------------------------ */

/** Squared distance from point `p` to segment `s`. */
export const segmentDistanceSq = (s: Segment2D, p: Point2D): number => {
  const dx = s.end.x - s.start.x
  const dy = s.end.y - s.start.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return pointDistanceSq(p, s.start)
  let t = ((p.x - s.start.x) * dx + (p.y - s.start.y) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const projX = s.start.x + t * dx
  const projY = s.start.y + t * dy
  const ex = p.x - projX
  const ey = p.y - projY
  return ex * ex + ey * ey
}
