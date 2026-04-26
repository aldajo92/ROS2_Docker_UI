/**
 * 2D direction / displacement vector. Distinct from Point2D so APIs
 * can encode whether a value is a position (Point) or a delta /
 * direction (Vector). Crossing types is mediated through `operations2D`.
 */
export class Vector2D {
  readonly x: number
  readonly y: number

  constructor(x: number, y: number) {
    this.x = x
    this.y = y
  }

  static zero(): Vector2D {
    return new Vector2D(0, 0)
  }

  static unitX(): Vector2D {
    return new Vector2D(1, 0)
  }

  static unitY(): Vector2D {
    return new Vector2D(0, 1)
  }

  static of(x: number, y: number): Vector2D {
    return new Vector2D(x, y)
  }

  /** Polar constructor: angle in radians, length in meters (default 1). */
  static fromAngle(rad: number, length = 1): Vector2D {
    return new Vector2D(Math.cos(rad) * length, Math.sin(rad) * length)
  }

  toArray(): [number, number] {
    return [this.x, this.y]
  }

  toString(): string {
    return `Vector2D(${this.x}, ${this.y})`
  }
}
