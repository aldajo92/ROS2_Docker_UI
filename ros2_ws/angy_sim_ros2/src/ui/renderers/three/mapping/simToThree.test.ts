import { describe, expect, it } from 'vitest'
import { Point2D } from '../../../../math/geometry/Point2D'
import { Point3D } from '../../../../math/geometry/Point3D'
import { Vector2D } from '../../../../math/geometry/Vector2D'
import { Vector3D } from '../../../../math/geometry/Vector3D'
import {
  simPoint2DToThree,
  simPoint3DToThree,
  simVector2DToThree,
  simVector3DToThree,
  simYawToThreeRotationY,
} from './simToThree'
import {
  threeRotationYToSimYaw,
  threeVectorToSimPoint2D,
  threeVectorToSimPoint3D,
} from './threeToSim'

describe('simToThree mappings', () => {
  it('places a 2D point on the three.js XZ plane at the given height', () => {
    const v = simPoint2DToThree(Point2D.of(3, 4), 0.5)
    expect(v.x).toBe(3)
    expect(v.y).toBe(0.5)
    expect(v.z).toBe(4)
  })

  it('maps sim 3D (x, y, z) to three (x, z, y)', () => {
    const v = simPoint3DToThree(Point3D.of(1, 2, 3))
    expect(v.x).toBe(1)
    expect(v.y).toBe(3)
    expect(v.z).toBe(2)
  })

  it('maps 2D vectors with the same convention as 2D points', () => {
    const v = simVector2DToThree(Vector2D.of(2, -5), 1)
    expect(v.x).toBe(2)
    expect(v.y).toBe(1)
    expect(v.z).toBe(-5)
  })

  it('maps 3D vectors with the same convention as 3D points', () => {
    const v = simVector3DToThree(Vector3D.of(7, 8, 9))
    expect(v.x).toBe(7)
    expect(v.y).toBe(9)
    expect(v.z).toBe(8)
  })

  it('inverts yaw to keep mesh local +X aligned with sim heading', () => {
    expect(simYawToThreeRotationY(0)).toBe(-0)
    expect(simYawToThreeRotationY(Math.PI / 2)).toBeCloseTo(-Math.PI / 2)
    expect(simYawToThreeRotationY(-Math.PI / 4)).toBeCloseTo(Math.PI / 4)
  })
})

describe('threeToSim mappings (round-trip)', () => {
  it('round-trips 2D point through three and back', () => {
    const original = Point2D.of(2.5, -7.25)
    const round = threeVectorToSimPoint2D(simPoint2DToThree(original, 99))
    expect(round.x).toBe(original.x)
    expect(round.y).toBe(original.y)
  })

  it('round-trips 3D point through three and back', () => {
    const original = Point3D.of(1.1, 2.2, 3.3)
    const round = threeVectorToSimPoint3D(simPoint3DToThree(original))
    expect(round.x).toBeCloseTo(original.x)
    expect(round.y).toBeCloseTo(original.y)
    expect(round.z).toBeCloseTo(original.z)
  })

  it('round-trips yaw through three rotation and back', () => {
    for (const yaw of [0, 0.1, -0.5, Math.PI / 3, -Math.PI / 6]) {
      expect(threeRotationYToSimYaw(simYawToThreeRotationY(yaw))).toBeCloseTo(yaw)
    }
  })
})
