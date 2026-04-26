import { Point2D } from './Point2D'

/**
 * Bounded 2D segment between two points. Useful for path edges,
 * obstacle sides, and collision queries.
 */
export class Segment2D {
  readonly start: Point2D
  readonly end: Point2D

  constructor(start: Point2D, end: Point2D) {
    this.start = start
    this.end = end
  }

  length(): number {
    return Math.hypot(this.end.x - this.start.x, this.end.y - this.start.y)
  }

  midpoint(): Point2D {
    return new Point2D((this.start.x + this.end.x) / 2, (this.start.y + this.end.y) / 2)
  }
}
