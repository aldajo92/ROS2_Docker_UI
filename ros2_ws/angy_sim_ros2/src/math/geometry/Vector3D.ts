/**
 * 3D direction / displacement vector. Counterpart to Vector2D.
 */
export class Vector3D {
  readonly x: number
  readonly y: number
  readonly z: number

  constructor(x: number, y: number, z: number) {
    this.x = x
    this.y = y
    this.z = z
  }

  static zero(): Vector3D {
    return new Vector3D(0, 0, 0)
  }

  static unitX(): Vector3D {
    return new Vector3D(1, 0, 0)
  }

  static unitY(): Vector3D {
    return new Vector3D(0, 1, 0)
  }

  static unitZ(): Vector3D {
    return new Vector3D(0, 0, 1)
  }

  static of(x: number, y: number, z: number): Vector3D {
    return new Vector3D(x, y, z)
  }

  toArray(): [number, number, number] {
    return [this.x, this.y, this.z]
  }

  toString(): string {
    return `Vector3D(${this.x}, ${this.y}, ${this.z})`
  }
}
