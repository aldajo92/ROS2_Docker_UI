import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { Point2D } from '../../../../math/geometry/Point2D'
import { Point3D } from '../../../../math/geometry/Point3D'
import { Vector2D } from '../../../../math/geometry/Vector2D'
import { Vector3D } from '../../../../math/geometry/Vector3D'
import {
  getThreeCameraUpForSimulationZUp,
  getThreeCameraUpForTopDown,
  getThreePositionForGazeboLikeCamera,
  getThreePositionForTopDownCamera,
  simDirection3DToThree,
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

const EPS = 1e-9

/** Convenience: build a Vector3 from raw numbers without leaking
 *  THREE allocations into every test body. */
function v(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z)
}

/** Three.js's lookAt uses this exact construction; we re-derive
 *  the camera frame here to assert what the user *sees*, free of
 *  any THREE.PerspectiveCamera-only state. */
function deriveCameraFrame(
  eye: THREE.Vector3,
  target: THREE.Vector3,
  up: THREE.Vector3,
): { right: THREE.Vector3; screenUp: THREE.Vector3; forward: THREE.Vector3 } {
  const zAxis = eye.clone().sub(target).normalize() // +Z = toward viewer
  const xAxis = new THREE.Vector3().crossVectors(up, zAxis).normalize()
  const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis)
  return {
    right: xAxis,
    screenUp: yAxis,
    forward: zAxis.clone().negate(),
  }
}

describe('simToThree mapping', () => {
  describe('right-handedness of the embedding', () => {
    it('preserves the right-hand rule: simX × simY = simZ in three space', () => {
      const simX = simDirection3DToThree(1, 0, 0)
      const simY = simDirection3DToThree(0, 1, 0)
      const simZ = simDirection3DToThree(0, 0, 1)
      const cross = new THREE.Vector3().crossVectors(simX, simY)
      expect(cross.x).toBeCloseTo(simZ.x, 9)
      expect(cross.y).toBeCloseTo(simZ.y, 9)
      expect(cross.z).toBeCloseTo(simZ.z, 9)
    })

    it('maps each sim basis vector to its documented three image', () => {
      expect(simDirection3DToThree(1, 0, 0).equals(v(1, 0, 0))).toBe(true)
      expect(simDirection3DToThree(0, 1, 0).equals(v(0, 0, -1))).toBe(true)
      expect(simDirection3DToThree(0, 0, 1).equals(v(0, 1, 0))).toBe(true)
    })
  })

  describe('point and vector helpers', () => {
    it('simPoint2DToThree drops sim Y onto three -Z and lifts via height', () => {
      const out = simPoint2DToThree(Point2D.of(2, 3), 0.5)
      expect(out.x).toBeCloseTo(2, 9)
      expect(out.y).toBeCloseTo(0.5, 9)
      expect(out.z).toBeCloseTo(-3, 9)
    })

    it('simPoint3DToThree maps (sim.x, sim.y, sim.z) → (x, z, -y)', () => {
      const out = simPoint3DToThree(Point3D.of(2, 3, 4))
      expect(out.x).toBeCloseTo(2, 9)
      expect(out.y).toBeCloseTo(4, 9)
      expect(out.z).toBeCloseTo(-3, 9)
    })

    it('vector helpers agree with point helpers for the same numbers', () => {
      const p2 = simPoint2DToThree(Point2D.of(1, 2), 7)
      const v2 = simVector2DToThree(Vector2D.of(1, 2), 7)
      expect(v2.equals(p2)).toBe(true)

      const p3 = simPoint3DToThree(Point3D.of(1, 2, 3))
      const v3 = simVector3DToThree(Vector3D.of(1, 2, 3))
      expect(v3.equals(p3)).toBe(true)
    })

    it('round-trip through threeToSim recovers the original sim point', () => {
      const original = Point3D.of(1.25, -3.5, 0.75)
      const back = threeVectorToSimPoint3D(simPoint3DToThree(original))
      expect(back.x).toBeCloseTo(original.x, 9)
      expect(back.y).toBeCloseTo(original.y, 9)
      expect(back.z).toBeCloseTo(original.z, 9)
    })

    it('2D round-trip drops Z but recovers X and (signed) Y', () => {
      const ground = Point2D.of(2, -5)
      const back = threeVectorToSimPoint2D(simPoint2DToThree(ground, 9))
      expect(back.x).toBeCloseTo(ground.x, 9)
      expect(back.y).toBeCloseTo(ground.y, 9)
    })
  })

  describe('yaw mapping', () => {
    it('is identity (no sign flip) under the right-handed mapping', () => {
      expect(simYawToThreeRotationY(0)).toBeCloseTo(0, 9)
      expect(simYawToThreeRotationY(Math.PI / 2)).toBeCloseTo(Math.PI / 2, 9)
      expect(threeRotationYToSimYaw(simYawToThreeRotationY(1.234))).toBeCloseTo(
        1.234,
        9,
      )
    })

    it('rotates a +X-forward mesh so heading is sim +Y at yaw=π/2 (= three -Z)', () => {
      // Independent verification of `simYawToThreeRotationY`: rotate the
      // mesh's local +X by `rotation.y = simYawToThreeRotationY(yaw)` and
      // confirm the result equals `simDirection3DToThree(cos yaw, sin yaw, 0)`.
      const yaw = Math.PI / 2
      const localForward = v(1, 0, 0)
      const rotation = new THREE.Euler(0, simYawToThreeRotationY(yaw), 0, 'XYZ')
      const heading = localForward.clone().applyEuler(rotation)

      const expected = simDirection3DToThree(Math.cos(yaw), Math.sin(yaw), 0)
      expect(heading.x).toBeCloseTo(expected.x, EPS)
      expect(heading.y).toBeCloseTo(expected.y, EPS)
      expect(heading.z).toBeCloseTo(expected.z, EPS)
    })
  })

  describe('camera presets', () => {
    it('top-down camera shows sim +X to the right and sim +Y up on screen', () => {
      const eye = getThreePositionForTopDownCamera(20)
      const up = getThreeCameraUpForTopDown()
      const target = v(0, 0, 0)

      const frame = deriveCameraFrame(eye, target, up)
      const expectedRight = simDirection3DToThree(1, 0, 0).normalize()
      const expectedUp = simDirection3DToThree(0, 1, 0).normalize()

      expect(frame.right.x).toBeCloseTo(expectedRight.x, EPS)
      expect(frame.right.y).toBeCloseTo(expectedRight.y, EPS)
      expect(frame.right.z).toBeCloseTo(expectedRight.z, EPS)

      expect(frame.screenUp.x).toBeCloseTo(expectedUp.x, EPS)
      expect(frame.screenUp.y).toBeCloseTo(expectedUp.y, EPS)
      expect(frame.screenUp.z).toBeCloseTo(expectedUp.z, EPS)
    })

    it('top-down camera looks along sim -Z (= three -Y)', () => {
      const eye = getThreePositionForTopDownCamera(7)
      const frame = deriveCameraFrame(eye, v(0, 0, 0), getThreeCameraUpForTopDown())
      // Looking down: forward should equal three -Y.
      expect(frame.forward.x).toBeCloseTo(0, EPS)
      expect(frame.forward.y).toBeCloseTo(-1, EPS)
      expect(frame.forward.z).toBeCloseTo(0, EPS)
    })

    it('Gazebo-like camera sits at sim (+d, -d, +d) and uses sim+Z as up', () => {
      const d = 5
      const pos = getThreePositionForGazeboLikeCamera(d)
      // sim (+d, -d, +d) → three (+d, +d, +d) under our mapping.
      expect(pos.x).toBeCloseTo(d, 9)
      expect(pos.y).toBeCloseTo(d, 9)
      expect(pos.z).toBeCloseTo(d, 9)

      const up = getThreeCameraUpForSimulationZUp()
      expect(up.equals(v(0, 1, 0))).toBe(true)
    })

    it('Gazebo-like camera shows the world +Z axis pointing screen-up', () => {
      const eye = getThreePositionForGazeboLikeCamera(5)
      const frame = deriveCameraFrame(
        eye,
        v(0, 0, 0),
        getThreeCameraUpForSimulationZUp(),
      )
      // The screen-up vector should have a strictly positive component
      // along three +Y (= sim +Z): vertical is up on screen.
      expect(frame.screenUp.y).toBeGreaterThan(0)
    })
  })
})
