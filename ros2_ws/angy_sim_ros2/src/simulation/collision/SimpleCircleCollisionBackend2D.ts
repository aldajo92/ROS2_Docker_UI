import type { CollisionBackend2D } from './CollisionBackend2D'
import type {
  CircleCollisionShape2D,
  CollisionShape2D,
  OrientedBoxCollisionShape2D,
} from './CollisionShape2D'
import type { CollisionContact2D } from './CollisionContact2D'

/**
 * Default backend. O(n²) pairwise checks in the simulation X/Y plane.
 *
 * Supported shape combinations:
 *   - circle × circle        (distance test)
 *   - circle × oriented_box  (point-in-OBB distance test; used by the
 *                             rectangle static obstacle feature)
 *   - oriented_box × oriented_box (2D SAT over the four local axes)
 *
 * Trade-off: no broad-phase pruning, small and dependency-free, and
 * deterministic for ≲100 entities. For larger scenes swap in a backend
 * with a proper broad-phase (e.g. `RapierCollisionBackend2D`) — the
 * interface does not change.
 *
 * Determinism guarantee: pair iteration follows insertion order
 * (`i < j`). For every reported contact, `entityAId` is the shape that
 * appeared first in the input array and the normal points from A to B.
 *
 * The legacy class name is preserved so `CollisionConfig.backend =
 * 'simpleCircle2D'` keeps working without a migration.
 */
export class SimpleCircleCollisionBackend2D implements CollisionBackend2D {
  readonly name = 'SimpleCircleCollisionBackend2D'

  detect(shapes: readonly CollisionShape2D[]): CollisionContact2D[] {
    const contacts: CollisionContact2D[] = []

    for (let i = 0; i < shapes.length; i++) {
      const a = shapes[i]
      for (let j = i + 1; j < shapes.length; j++) {
        const b = shapes[j]
        const contact = detectPair(a, b)
        if (contact) contacts.push(contact)
      }
    }

    return contacts
  }
}

/* ------------------------------------------------------------------------ */
/* dispatch                                                                 */
/* ------------------------------------------------------------------------ */

function detectPair(
  a: CollisionShape2D,
  b: CollisionShape2D,
): CollisionContact2D | undefined {
  if (a.type === 'circle' && b.type === 'circle') {
    return detectCircleVsCircle(a, b)
  }
  if (a.type === 'circle' && b.type === 'oriented_box') {
    return detectCircleVsBox(a, b, /*circleIsA*/ true)
  }
  if (a.type === 'oriented_box' && b.type === 'circle') {
    return detectCircleVsBox(b, a, /*circleIsA*/ false)
  }
  if (a.type === 'oriented_box' && b.type === 'oriented_box') {
    return detectBoxVsBox(a, b)
  }
  return undefined
}

/* ------------------------------------------------------------------------ */
/* circle × circle                                                          */
/* ------------------------------------------------------------------------ */

function detectCircleVsCircle(
  a: CircleCollisionShape2D,
  b: CircleCollisionShape2D,
): CollisionContact2D | undefined {
  const dx = b.center.x - a.center.x
  const dy = b.center.y - a.center.y
  const radiusSum = a.radius + b.radius
  const distanceSq = dx * dx + dy * dy
  const radiusSumSq = radiusSum * radiusSum

  if (distanceSq > radiusSumSq) return undefined

  const distance = Math.sqrt(distanceSq)
  // Coincident centers: pick an arbitrary but stable normal so
  // downstream consumers don't get NaN.
  const normal =
    distance > 1e-9
      ? { x: dx / distance, y: dy / distance }
      : { x: 1, y: 0 }

  return {
    entityAId: a.entityId,
    entityBId: b.entityId,
    normal,
    penetrationDepth: Math.max(0, radiusSum - distance),
  }
}

/* ------------------------------------------------------------------------ */
/* circle × oriented_box                                                    */
/* ------------------------------------------------------------------------ */

/**
 * `circleIsA === true`  ⇒ the caller wants the contact reported as
 *                         (circle, box); normal points circle → box.
 * `circleIsA === false` ⇒ the caller wants the contact reported as
 *                         (box, circle); normal points box → circle.
 */
function detectCircleVsBox(
  circle: CircleCollisionShape2D,
  box: OrientedBoxCollisionShape2D,
  circleIsA: boolean,
): CollisionContact2D | undefined {
  const cos = Math.cos(box.pose.yaw)
  const sin = Math.sin(box.pose.yaw)

  // World-space delta from box center to circle center.
  const dx = circle.center.x - box.pose.x
  const dy = circle.center.y - box.pose.y

  // Rotate by -yaw to enter the box's local frame: local +X → world
  // (cos, sin); to undo, local = R(-yaw) · world.
  const localX = dx * cos + dy * sin
  const localY = -dx * sin + dy * cos

  const halfW = box.width / 2 // along local +X
  const halfL = box.length / 2 // along local +Y

  const clampedX = Math.max(-halfW, Math.min(halfW, localX))
  const clampedY = Math.max(-halfL, Math.min(halfL, localY))

  const deltaX = localX - clampedX
  const deltaY = localY - clampedY
  const distSq = deltaX * deltaX + deltaY * deltaY
  const r = circle.radius

  let localNx: number
  let localNy: number
  let penetrationDepth: number

  if (distSq > r * r) {
    return undefined
  }

  if (distSq > 1e-18) {
    const dist = Math.sqrt(distSq)
    localNx = deltaX / dist
    localNy = deltaY / dist
    penetrationDepth = r - dist
  } else {
    // Circle center lies inside the box: escape along the axis with the
    // smallest remaining clearance. Penetration is radius + inside
    // depth, which is the conventional "push-out" distance.
    const right = halfW - localX // overlap along +X (push +X)
    const left = halfW + localX // overlap along -X (push -X)
    const top = halfL - localY // overlap along +Y
    const bottom = halfL + localY // overlap along -Y
    const minOverlap = Math.min(right, left, top, bottom)
    if (minOverlap === right) {
      localNx = 1
      localNy = 0
    } else if (minOverlap === left) {
      localNx = -1
      localNy = 0
    } else if (minOverlap === top) {
      localNx = 0
      localNy = 1
    } else {
      localNx = 0
      localNy = -1
    }
    penetrationDepth = r + minOverlap
  }

  // Local normal points from the box outward toward the circle.
  // Rotate back to world space.
  const worldNx = localNx * cos - localNy * sin
  const worldNy = localNx * sin + localNy * cos

  if (circleIsA) {
    // Report as (circle, box): contract requires normal A → B, i.e.
    // circle → box, i.e. the flip of "box → circle".
    return {
      entityAId: circle.entityId,
      entityBId: box.entityId,
      normal: { x: -worldNx, y: -worldNy },
      penetrationDepth,
    }
  }
  return {
    entityAId: box.entityId,
    entityBId: circle.entityId,
    normal: { x: worldNx, y: worldNy },
    penetrationDepth,
  }
}

/* ------------------------------------------------------------------------ */
/* oriented_box × oriented_box (SAT)                                        */
/* ------------------------------------------------------------------------ */

function detectBoxVsBox(
  a: OrientedBoxCollisionShape2D,
  b: OrientedBoxCollisionShape2D,
): CollisionContact2D | undefined {
  const axesA = boxLocalAxes(a)
  const axesB = boxLocalAxes(b)

  // SAT over the 4 candidate axes (2 from each box). We track the axis
  // with the minimum overlap to use as the collision normal and
  // penetration depth; if any axis has no overlap, the boxes are
  // separated.
  let minOverlap = Infinity
  let minAxisX = 0
  let minAxisY = 0

  for (const axis of [axesA.x, axesA.y, axesB.x, axesB.y]) {
    const overlap = overlapOnAxis(a, axesA, b, axesB, axis)
    if (overlap === undefined) return undefined
    if (overlap.magnitude < minOverlap) {
      minOverlap = overlap.magnitude
      // Point the separating axis from A toward B so the contract's
      // A→B normal holds.
      const dx = b.pose.x - a.pose.x
      const dy = b.pose.y - a.pose.y
      const sign = axis.x * dx + axis.y * dy < 0 ? -1 : 1
      minAxisX = axis.x * sign
      minAxisY = axis.y * sign
    }
  }

  return {
    entityAId: a.entityId,
    entityBId: b.entityId,
    normal: { x: minAxisX, y: minAxisY },
    penetrationDepth: minOverlap,
  }
}

interface BoxAxes {
  x: { x: number; y: number }
  y: { x: number; y: number }
  /** Half-extent along local +X (width / 2). */
  halfW: number
  /** Half-extent along local +Y (length / 2). */
  halfL: number
  center: { x: number; y: number }
}

function boxLocalAxes(box: OrientedBoxCollisionShape2D): BoxAxes {
  const cos = Math.cos(box.pose.yaw)
  const sin = Math.sin(box.pose.yaw)
  return {
    x: { x: cos, y: sin },
    y: { x: -sin, y: cos },
    halfW: box.width / 2,
    halfL: box.length / 2,
    center: { x: box.pose.x, y: box.pose.y },
  }
}

function overlapOnAxis(
  _a: OrientedBoxCollisionShape2D,
  axesA: BoxAxes,
  _b: OrientedBoxCollisionShape2D,
  axesB: BoxAxes,
  axis: { x: number; y: number },
): { magnitude: number } | undefined {
  const centerA = axesA.center.x * axis.x + axesA.center.y * axis.y
  const centerB = axesB.center.x * axis.x + axesB.center.y * axis.y
  const radiusA =
    Math.abs(axesA.halfW * (axesA.x.x * axis.x + axesA.x.y * axis.y)) +
    Math.abs(axesA.halfL * (axesA.y.x * axis.x + axesA.y.y * axis.y))
  const radiusB =
    Math.abs(axesB.halfW * (axesB.x.x * axis.x + axesB.x.y * axis.y)) +
    Math.abs(axesB.halfL * (axesB.y.x * axis.x + axesB.y.y * axis.y))
  const distance = Math.abs(centerA - centerB)
  if (distance > radiusA + radiusB) return undefined
  return { magnitude: radiusA + radiusB - distance }
}
