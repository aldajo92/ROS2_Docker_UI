/**
 * 2D position in some reference frame, in meters.
 *
 * Treated as an immutable value object: instances expose readonly
 * fields and any "modification" returns a new Point2D. Keep it
 * deliberately tiny — richer math lives in `operations2D`.
 */
export class Point2D {
  readonly x: number
  readonly y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  static origin(): Point2D {
    return new Point2D(0, 0)
  }

  static of(x: number, y: number): Point2D {
    return new Point2D(x, y)
  }

  with(overrides: { x?: number; y?: number }): Point2D {
    return new Point2D(overrides.x ?? this.x, overrides.y ?? this.y)
  }

  equals(other: Point2D, epsilon = 0): boolean {
    if (epsilon === 0) return this.x === other.x && this.y === other.y
    return (
      Math.abs(this.x - other.x) <= epsilon &&
      Math.abs(this.y - other.y) <= epsilon
    )
  }

  toArray(): [number, number] {
    return [this.x, this.y]
  }

  toString(): string {
    return `Point2D(${this.x}, ${this.y})`
  }
}
