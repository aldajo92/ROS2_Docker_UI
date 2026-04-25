export interface Point {
  readonly x: number
  readonly y: number
  readonly z: number
}

// Bring back later
// export interface Quaternion {
//   readonly x: number
//   readonly y: number
//   readonly z: number
//   readonly w: number
// }

export class Point2D implements Point {
  readonly x: number
  readonly y: number
  readonly z = 0

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  toString(): string {
    return `(${this.x}, ${this.y})`
  }
}

// Full 3D point.
export class Point3D implements Point {
  readonly x: number
  readonly y: number
  readonly z: number

  constructor(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
  }

  toString(): string {
    return `(${this.x}, ${this.y}, ${this.z})`
  }
}


// --- Math operations ----------------------------------------------------
// Each takes any `Point` and returns a `Point3D` (since the result might
// have a non-zero z even if the inputs are 2D, e.g. after scaling).

export function add(a: Point, b: Point): Point3D {
  return new Point3D(a.x + b.x, a.y + b.y, a.z + b.z)
}

export function sub(a: Point, b: Point): Point3D {
  return new Point3D(a.x - b.x, a.y - b.y, a.z - b.z)
}

export function scale(p: Point, s: number): Point3D {
  return new Point3D(p.x * s, p.y * s, p.z * s)
}

export function distance(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export function equals(a: Point, b: Point, eps: number = 1e-9): boolean {
  return (
    Math.abs(a.x - b.x) <= eps &&
    Math.abs(a.y - b.y) <= eps &&
    Math.abs(a.z - b.z) <= eps
  )
}

// --- Line ---------------------------------------------------------------

export class Line {
  readonly p: Point
  readonly q: Point

  constructor(p: Point, q: Point) {
    this.p = p
    this.q = q
  }
}
