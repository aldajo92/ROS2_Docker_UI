import { Point2D } from './Point2D'

/**
 * 2D pose: position + heading (yaw, in radians, CCW from +X).
 *
 * Position is stored as a Point2D so coords always carry their type;
 * yaw is a plain number because radians are fundamental.
 */
export class Pose2D {
  readonly position: Point2D
  readonly yaw: number

  constructor(position: Point2D, yaw: number) {
    this.position = position
    this.yaw = yaw
  }

  static identity(): Pose2D {
    return new Pose2D(Point2D.origin(), 0)
  }

  static of(x: number, y: number, yaw = 0): Pose2D {
    return new Pose2D(new Point2D(x, y), yaw)
  }

  with(overrides: { position?: Point2D; yaw?: number }): Pose2D {
    return new Pose2D(overrides.position ?? this.position, overrides.yaw ?? this.yaw)
  }

  toString(): string {
    return `Pose2D(x=${this.position.x}, y=${this.position.y}, yaw=${this.yaw})`
  }
}
