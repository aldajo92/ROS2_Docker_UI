// Conversions between our world-frame `Point` types and three.js objects
// (Vector2 / Vector3 / position tuples).
//
// Two flavors are exposed for every direction:
//
//   * `*Direct` helpers leave coordinates untouched. Use them for objects
//     that live INSIDE <WorldFrame>, where (x, y, z) world coords map 1:1
//     onto three.js inside the tilted group.
//
//   * `*Scene` helpers apply the world->scene rotation defined in
//     `scene/world.tsx` (X forward, Y left, Z up  ->  Y up). Use them for
//     objects that live OUTSIDE <WorldFrame>, e.g. camera positions or
//     raw scene-space coordinates.

import * as THREE from 'three'
import type { Point } from './SimBase'
import { Point2D, Point3D } from './SimBase'
import { sceneToWorld, worldToScene } from '../scene/world'

// --- Point -> three.js (world-frame, direct) ----------------------------

export function pointToVector3(p: Point): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z)
}

export function point2DToVector2(p: Point2D): THREE.Vector2 {
  return new THREE.Vector2(p.x, p.y)
}

// Convenience for components that take a `position` prop.
export function pointToTuple(p: Point): [number, number, number] {
  return [p.x, p.y, p.z]
}

// --- Point -> three.js (scene-space, frame-converted) -------------------

export function pointToSceneVector3(p: Point): THREE.Vector3 {
  const [sx, sy, sz] = worldToScene(p.x, p.y, p.z)
  return new THREE.Vector3(sx, sy, sz)
}

export function pointToSceneTuple(p: Point): [number, number, number] {
  return worldToScene(p.x, p.y, p.z)
}

// --- three.js -> Point (world-frame, direct) ----------------------------

export function vector3ToPoint3D(v: THREE.Vector3): Point3D {
  return new Point3D(v.x, v.y, v.z)
}

export function vector2ToPoint2D(v: THREE.Vector2): Point2D {
  return new Point2D(v.x, v.y)
}

// --- three.js -> Point (scene-space, frame-converted) -------------------

export function sceneVector3ToPoint3D(v: THREE.Vector3): Point3D {
  const [wx, wy, wz] = sceneToWorld(v.x, v.y, v.z)
  return new Point3D(wx, wy, wz)
}

// --- In-place helpers ---------------------------------------------------
// Useful in render loops where you want to avoid allocations. Each
// returns the (mutated) target so calls can be chained.

export function copyPointToVector3(
  p: Point,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.set(p.x, p.y, p.z)
}

export function copyPointToSceneVector3(
  p: Point,
  target: THREE.Vector3,
): THREE.Vector3 {
  const [sx, sy, sz] = worldToScene(p.x, p.y, p.z)
  return target.set(sx, sy, sz)
}
