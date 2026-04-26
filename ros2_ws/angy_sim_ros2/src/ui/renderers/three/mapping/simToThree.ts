import * as THREE from 'three'
import type { Point2D } from '../../../../math/geometry/Point2D'
import type { Point3D } from '../../../../math/geometry/Point3D'
import type { Vector2D } from '../../../../math/geometry/Vector2D'
import type { Vector3D } from '../../../../math/geometry/Vector3D'

/**
 * The single source of truth for translating simulation coordinates
 * into Three.js coordinates. Renderers and camera controllers must
 * never encode this mapping themselves — always go through these
 * helpers, so a future change of convention is a one-file edit.
 *
 * Simulation engine convention (right-handed, Z-up):
 *
 *     +X right, +Y forward, +Z up         yaw CCW from +X about +Z
 *
 * Three.js convention (right-handed, Y-up). To embed sim into three
 * **without flipping handedness**, we use:
 *
 *     sim +X  →  three +X
 *     sim +Y  →  three -Z      (note the sign — see proof below)
 *     sim +Z  →  three +Y
 *
 * Right-handedness check (in three space):
 *
 *     sim+X × sim+Y = (1,0,0) × (0,0,-1)
 *                   = (0·(-1) - 0·0, 0·0 - 1·(-1), 1·0 - 0·0)
 *                   = (0, 1, 0)
 *                   = three+Y = sim+Z   ✓
 *
 * The earlier (sim +Y → three +Z) mapping is **left-handed** in three
 * space and made Gazebo-style top-down (+X right, +Y up, X×Y=+Z toward
 * viewer) impossible — a Three.js camera is always right-handed in
 * its local frame.
 *
 * Yaw mapping under this convention: a sim yaw of +π/2 rotates a
 * vehicle from sim+X to sim+Y, i.e. from three+X to three-Z. A
 * positive `rotation.y` in three rotates +X toward -Z, so
 * `rotation.y = +yaw` (no sign flip).
 */

/* -- point / vector mapping ------------------------------------------ */

/** Sim 2D point (on the ground plane) → three.js position at `height`. */
export function simPoint2DToThree(point: Point2D, height = 0): THREE.Vector3 {
  return new THREE.Vector3(point.x, height, -point.y)
}

/** Sim 3D point → three.js position. */
export function simPoint3DToThree(point: Point3D): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.z, -point.y)
}

/** Sim 2D vector (on the ground plane) → three.js displacement. */
export function simVector2DToThree(vector: Vector2D, height = 0): THREE.Vector3 {
  return new THREE.Vector3(vector.x, height, -vector.y)
}

/** Sim 3D vector → three.js displacement. */
export function simVector3DToThree(vector: Vector3D): THREE.Vector3 {
  return new THREE.Vector3(vector.x, vector.z, -vector.y)
}

/**
 * Map a sim direction (any 3-tuple, not necessarily unit) to its
 * three-space orientation. Used by renderers that need to *aim*
 * something rather than place it — e.g. orienting an axis arrow,
 * setting a camera's up vector, projecting a velocity vector.
 *
 * Magnitudes are preserved; rotations and signs are not since the
 * Y axis flips. Callers that need a unit vector should normalize the
 * result.
 */
export function simDirection3DToThree(
  x: number,
  y: number,
  z: number,
): THREE.Vector3 {
  return new THREE.Vector3(x, z, -y)
}

/* -- yaw -------------------------------------------------------------- */

/**
 * Convert simulation yaw (CCW from +X, around sim +Z) into a Three.js
 * rotation around the +Y axis, assuming the rendered mesh's local
 * forward is +X (the engine convention).
 *
 * With the right-handed mapping above, sim yaw and three rotation.y
 * agree in sign — derivation:
 *
 *   At yaw=+π/2, sim heading goes from +X to +Y, which in three space
 *   is from (1,0,0) to (0,0,-1). Rotation about three +Y by θ takes
 *   (1,0,0) to (cosθ, 0, -sinθ). At θ=+π/2 that's (0,0,-1).  ✓
 */
export function simYawToThreeRotationY(yaw: number): number {
  return yaw
}

/* -- camera presets -------------------------------------------------- */

/**
 * Three.js `up` vector for a top-down camera that wants sim +Y at
 * the **top of the screen**. Top-down means looking along sim −Z (=
 * looking down at the X/Y plane), and the screen-up axis must be
 * sim +Y, which under our mapping is three −Z. See
 * `getThreePositionForTopDownCamera` for the position pair.
 */
export function getThreeCameraUpForTopDown(): THREE.Vector3 {
  return simDirection3DToThree(0, 1, 0)
}

/**
 * Three.js `up` vector for any non-top-down camera (orbit, follow,
 * 3/4 perspective). Sim +Z (= three +Y) is the world vertical, so
 * keeping that as the camera's up gives Gazebo-like behavior:
 * orbiting the camera around the scene never rolls horizon.
 */
export function getThreeCameraUpForSimulationZUp(): THREE.Vector3 {
  return simDirection3DToThree(0, 0, 1)
}

/**
 * Three.js camera position for a Gazebo-like 3/4 perspective default.
 * In sim coordinates we want the camera to sit ahead-and-right-and-
 * above the origin, looking back at it — Gazebo's `pose 5 -5 5 0 …`
 * convention. The mapping puts that at three (5, 5, 5) for the
 * default `distance = 5`, but call sites should never hard-code it:
 * pass a sim distance and let the helper do the mapping.
 *
 * @param distance Sim-frame multiplier; the camera ends up at
 *                 sim `(+d, -d, +d)`.
 */
export function getThreePositionForGazeboLikeCamera(
  distance = 8,
): THREE.Vector3 {
  return simPoint3DToThreePosition(distance, -distance, distance)
}

/**
 * Three.js camera position for a top-down view at altitude
 * `simHeight` along sim +Z. Resolves to three (0, simHeight, 0),
 * but callers shouldn't write the (0, h, 0) literal themselves —
 * the mapping owns it.
 */
export function getThreePositionForTopDownCamera(
  simHeight: number,
): THREE.Vector3 {
  return simPoint3DToThreePosition(0, 0, simHeight)
}

/** Internal: map raw sim numeric coords (no Point3D class allocation)
 *  to a three position. Same formula as `simPoint3DToThree` but takes
 *  primitives — useful for camera helpers where allocating a Point3D
 *  just to map and discard is wasteful. */
function simPoint3DToThreePosition(
  simX: number,
  simY: number,
  simZ: number,
): THREE.Vector3 {
  return new THREE.Vector3(simX, simZ, -simY)
}
