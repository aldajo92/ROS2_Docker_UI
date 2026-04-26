import * as THREE from 'three'
import type { Point2D } from '../../../../math/geometry/Point2D'
import type { Point3D } from '../../../../math/geometry/Point3D'
import type { Vector2D } from '../../../../math/geometry/Vector2D'
import type { Vector3D } from '../../../../math/geometry/Vector3D'

/**
 * The single source of truth for translating simulation coordinates
 * into Three.js coordinates. Renderers must not encode this mapping
 * themselves — always go through these helpers so a future change of
 * convention only needs to be made in one place.
 *
 * See `coordinateConventions.ts` for the rationale.
 */

/** Sim 2D point (on the ground plane) → three.js position at `height` (in three Y). */
export function simPoint2DToThree(point: Point2D, height = 0): THREE.Vector3 {
  return new THREE.Vector3(point.x, height, point.y)
}

/** Sim 3D point → three.js position. */
export function simPoint3DToThree(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.z, point.y)
}

/** Sim 2D vector (on the ground plane) → three.js displacement at `height`. */
export function simVector2DToThree(vector: Vector2D, height = 0): THREE.Vector3 {
  return new THREE.Vector3(vector.x, height, vector.y)
}

/** Sim 3D vector → three.js displacement. */
export function simVector3DToThree(vector: Vector3D): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.z, vector.y)
}

/**
 * Convert simulation yaw (CCW from +X, around sim +Z) into a Three.js
 * rotation around the +Y axis, assuming the rendered mesh's local
 * forward direction is +X (the engine convention).
 *
 * Derivation: in three, a positive `rotation.y` (right-hand rule with
 * thumb = +Y) rotates +X → −Z. We want sim yaw=+π/2 (forward = sim+Y =
 * three+Z) to land mesh forward on three +Z, so we need the opposite
 * sign, i.e. `rotation.y = -yaw`.
 *
 * If a future entity ships with a model whose local forward is +Z
 * instead of +X, build a dedicated mapping in this module — never
 * patch it in the per-entity renderer.
 */
export function simYawToThreeRotationY(yaw: number): number {
  return -yaw
}
