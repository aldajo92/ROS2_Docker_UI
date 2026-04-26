/**
 * 3D position in some reference frame, in meters. Counterpart to
 * Point2D — see that file for the rationale on immutability and on
 * keeping the class itself tiny.
 */
export class Point3D {
  readonly x: number
  readonly y: number
  readonly z: number

  constructor(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
  }

  static origin(): Point3D {
    return new Point3D(0, 0, 0)
  }

  static of(x: number, y: number, z: number): Point3D {
    return new Point3D(x, y, z)
  }

  with(overrides: { x?: number; y?: number; z?: number }): Point3D {
    return new Point3D(
      overrides.x ?? this.x,
      overrides.y ?? this.y,
      overrides.z ?? this.z,
    )
  }

  equals(other: Point3D, epsilon = 0): boolean {
    if (epsilon === 0) return this.x === other.x && this.y === other.y && this.z === other.z
    return (
      Math.abs(this.x - other.x) <= epsilon &&
      Math.abs(this.y - other.y) <= epsilon &&
      Math.abs(this.z - other.z) <= epsilon
    )
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z]
  }

  toString(): string {
    return `Point3D(${this.x}, ${this.y}, ${this.z})`
  }
}
