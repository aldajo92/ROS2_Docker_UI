import type * as THREE from 'three'
import { Point2D } from '../../../../math/geometry/Point2D'
import { Point3D } from '../../../../math/geometry/Point3D'

/**
 * Reverse of `simToThree`. Used by future user-interaction code
 * (pointer picking, click-to-place, drag-to-edit) to project Three.js
 * world coordinates back into the simulation frame.
 *
 * Inverse of:
 *
 *     sim.x → three.x
 *     sim.y → three.z
 *     sim.z → three.y
 */

/** Three.js world position projected onto the sim ground plane (Z dropped). */
export function threeVectorToSimPoint2D(vector: THREE.Vector3): Point2D {
  return Point2D.of(vector.x, vector.z)
}

/** Three.js world position → sim 3D point. */
export function threeVectorToSimPoint3D(vector: THREE.Vector3): Point3D {
  return Point3D.of(vector.x, vector.z, vector.y)
}

/**
 * Inverse of `simYawToThreeRotationY` (assuming mesh local forward = +X).
 * Used when a user manipulates a mesh and we need to push the new yaw
 * back into the simulation.
 */
export function threeRotationYToSimYaw(rotationY: number): number {
  return -rotationY
}
