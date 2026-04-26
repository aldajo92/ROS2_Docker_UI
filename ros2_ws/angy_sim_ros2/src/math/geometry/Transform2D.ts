import { Point2D } from './Point2D'
import { Vector2D } from './Vector2D'

/**
 * 2D rigid transform: rotation followed by translation.
 *
 *     T(p) = R(rotation) · p + translation
 *
 * Compose with `compose(other)` (apply other first, then this).
 */
export class Transform2D {
  readonly translation: Vector2D
  readonly rotation: number // radians

  constructor(translation: Vector2D, rotation: number) {
    this.translation = translation
    this.rotation = rotation
  }

  static identity(): Transform2D {
    return new Transform2D(Vector2D.zero(), 0)
  }

  static fromXYTheta(x: number, y: number, theta: number): Transform2D {
    return new Transform2D(new Vector2D(x, y), theta)
  }

  applyToPoint(p: Point2D): Point2D {
    const c = Math.cos(this.rotation)
    const s = Math.sin(this.rotation)
    return new Point2D(
      p.x * c - p.y * s + this.translation.x,
      p.x * s + p.y * c + this.translation.y,
    )
  }

  applyToVector(v: Vector2D): Vector2D {
    const c = Math.cos(this.rotation)
    const s = Math.sin(this.rotation)
    return new Vector2D(v.x * c - v.y * s, v.x * s + v.y * c)
  }

  /** result = this ∘ other  (apply `other` first, then `this`). */
  compose(other: Transform2D): Transform2D {
    const c = Math.cos(this.rotation)
    const s = Math.sin(this.rotation)
    const tx = other.translation.x * c - other.translation.y * s + this.translation.x
    const ty = other.translation.x * s + other.translation.y * c + this.translation.y
    return new Transform2D(new Vector2D(tx, ty), this.rotation + other.rotation)
  }

  inverse(): Transform2D {
    const c = Math.cos(-this.rotation)
    const s = Math.sin(-this.rotation)
    return new Transform2D(
      new Vector2D(
        -(this.translation.x * c - this.translation.y * s),
        -(this.translation.x * s + this.translation.y * c),
      ),
      -this.rotation,
    )
  }
}
