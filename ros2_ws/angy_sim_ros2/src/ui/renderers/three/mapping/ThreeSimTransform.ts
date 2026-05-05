import * as THREE from 'three'
import type { Point2D } from '../../../../math/geometry/Point2D'
import {
  simPoint2DToThree,
  simYawToThreeRotationY,
} from './simToThree'

/**
 * High-level sim → Three.js transform helpers.
 *
 * **Purpose**: prevent renderer code from encoding the sim→three coordinate
 * mapping inline. Every helper here delegates to `simToThree.ts`; this file
 * adds no new coordinate formulas.
 *
 * **Boundary rule**: never import roslib, rosbridge, Phaser, React, or
 * simulation-core modules here. This module is Three.js–only UI code.
 *
 * ## Coordinate contract (see simToThree.ts for the full derivation)
 *
 * ```
 * sim +X  →  three +X
 * sim +Y  →  three −Z
 * sim +Z  →  three +Y
 * yaw     →  rotation.y = yaw  (no sign flip)
 * ```
 *
 * Renderers that consume simulation-frame data (positions, yaw, paths, pose
 * arrays, velocity vectors) **must** go through these helpers — never write
 * `.position.set(x, y, z)` or `.rotation.set(0, 0, yaw)` from sim values.
 *
 * Raw `THREE.Vector3(...)`, `.position.set(...)`, and `.rotation.set(...)` are
 * acceptable for local Three-space geometry (mesh shapes, lights, camera
 * internals) and must be commented to explain they are Three-space values.
 */

/** Minimum 2-D pose shape — position + yaw. Matches the vehicle pose contract. */
export interface Sim2DPose {
  position: Point2D
  yaw: number
}

/* -- Object3D mutators --------------------------------------------------- */

/**
 * Place `object` at the sim 2-D position projected onto the Three.js ground
 * plane at the given height.
 *
 * Equivalent to `object.position.copy(simPoint2DToThree(point, height))`.
 */
export function setSimPosition2D(
  object: THREE.Object3D,
  point: Point2D,
  height = 0,
): void {
  object.position.copy(simPoint2DToThree(point, height))
}

/**
 * Set the Three.js `rotation.y` from a sim yaw angle (CCW from +X).
 *
 * Equivalent to `object.rotation.set(0, simYawToThreeRotationY(yaw), 0)`.
 */
export function setSimYaw(object: THREE.Object3D, yaw: number): void {
  object.rotation.set(0, simYawToThreeRotationY(yaw), 0)
}

/**
 * Apply both position and yaw from a 2-D sim pose in a single call.
 * Equivalent to calling `setSimPosition2D` + `setSimYaw`.
 */
export function setSimPose2D(
  object: THREE.Object3D,
  pose: Sim2DPose,
  height = 0,
): void {
  setSimPosition2D(object, pose.position, height)
  setSimYaw(object, pose.yaw)
}

/* -- Buffer builders ----------------------------------------------------- */

/**
 * Convert an array of sim 2-D points to a flat `Float32Array` of Three.js
 * XYZ triples suitable for `LineGeometry.setPositions`.
 *
 * Layout: `[x₀, y₀, z₀, x₁, y₁, z₁, …]` where each triple is
 * `simPoint2DToThree(points[i], height)`.
 */
export function simPolyline2DToThreePositions(
  points: ReadonlyArray<Point2D>,
  height = 0,
): Float32Array {
  const out = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i++) {
    const v = simPoint2DToThree(points[i], height)
    out[i * 3] = v.x
    out[i * 3 + 1] = v.y
    out[i * 3 + 2] = v.z
  }
  return out
}

/**
 * Convert two sim 2-D endpoints to a pair of Three.js `Vector3`s.
 * Useful for segment renderers (velocity arrows, debug lines, etc.).
 */
export function simSegment2DToThreePoints(
  start: Point2D,
  end: Point2D,
  height = 0,
): [THREE.Vector3, THREE.Vector3] {
  return [simPoint2DToThree(start, height), simPoint2DToThree(end, height)]
}
