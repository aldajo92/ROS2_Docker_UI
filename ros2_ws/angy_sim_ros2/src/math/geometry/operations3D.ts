import { Point3D } from './Point3D'
import { Vector3D } from './Vector3D'

/* -- factories ------------------------------------------------------------ */

export const point3 = (x: number, y: number, z: number): Point3D => new Point3D(x, y, z)
export const vec3 = (x: number, y: number, z: number): Vector3D => new Vector3D(x, y, z)

/* -- vector ↔ vector ----------------------------------------------------- */

export const vectorAdd3 = (a: Vector3D, b: Vector3D): Vector3D =>
  new Vector3D(a.x + b.x, a.y + b.y, a.z + b.z)

export const vectorSub3 = (a: Vector3D, b: Vector3D): Vector3D =>
  new Vector3D(a.x - b.x, a.y - b.y, a.z - b.z)

export const vectorScale3 = (v: Vector3D, s: number): Vector3D =>
  new Vector3D(v.x * s, v.y * s, v.z * s)

export const vectorNegate3 = (v: Vector3D): Vector3D => new Vector3D(-v.x, -v.y, -v.z)

export const vectorDot3 = (a: Vector3D, b: Vector3D): number =>
  a.x * b.x + a.y * b.y + a.z * b.z

export const vectorCross3 = (a: Vector3D, b: Vector3D): Vector3D =>
  new Vector3D(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  )

export const vectorLength3 = (v: Vector3D): number =>
  Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)

export const vectorLengthSq3 = (v: Vector3D): number =>
  v.x * v.x + v.y * v.y + v.z * v.z

export const vectorNormalize3 = (v: Vector3D): Vector3D => {
  const len = vectorLength3(v)
  if (len === 0) return new Vector3D(0, 0, 0)
  return new Vector3D(v.x / len, v.y / len, v.z / len)
}

/* -- point ↔ vector ------------------------------------------------------ */

export const pointAdd3 = (p: Point3D, v: Vector3D): Point3D =>
  new Point3D(p.x + v.x, p.y + v.y, p.z + v.z)

export const pointSub3 = (a: Point3D, b: Point3D): Vector3D =>
  new Vector3D(a.x - b.x, a.y - b.y, a.z - b.z)

export const pointDistance3 = (a: Point3D, b: Point3D): number =>
  Math.sqrt(
    (a.x - b.x) * (a.x - b.x) +
      (a.y - b.y) * (a.y - b.y) +
      (a.z - b.z) * (a.z - b.z),
  )
