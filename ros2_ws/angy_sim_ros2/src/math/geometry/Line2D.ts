import { Point2D } from './Point2D'
import { Vector2D } from './Vector2D'

/**
 * Infinite 2D line: a point on the line plus a direction. Direction
 * does not have to be unit length — most consumers normalize as needed.
 */
export class Line2D {
  readonly origin: Point2D
  readonly direction: Vector2D

  constructor(origin: Point2D, direction: Vector2D) {
    this.origin = origin
    this.direction = direction
  }

  static throughPoints(a: Point2D, b: Point2D): Line2D {
    return new Line2D(a, new Vector2D(b.x - a.x, b.y - a.y))
  }
}
