/**
 * Pure 2-D raycasting math. No simulation state, no ROS types, no UI.
 *
 * Coordinate system: sim (+X right, +Y forward). Angles are CCW from +X.
 *
 * ## Supported shapes
 *   - Circle obstacles → exact analytic ray-vs-circle intersection.
 *   - Rectangle obstacles → ray transformed to rectangle local frame,
 *     then slab AABB test.
 *
 * ## Limitation
 * The first pass does not support angular noise on the ray angle. Callers
 * that need it should perturb `input.angle` before calling.
 */

export interface RaycastInput2D {
  origin: { x: number; y: number }
  /** Ray angle in radians, CCW from sensor +X. */
  angle: number
  /** Minimum range — hits closer than this are ignored (metres). */
  rangeMin: number
  /** Maximum range — rays that miss all shapes return `undefined`. */
  rangeMax: number
}

export interface RaycastHit2D {
  /** Distance from origin to hit point (metres). */
  range: number
  /** World-space hit point. */
  point: { x: number; y: number }
  /** Id of the intersected shape. */
  objectId?: string
  /** Shape kind for diagnostic purposes. */
  objectKind?: string
}

/** Circle with known world-space centre and radius. */
export interface CircleShape2D {
  kind: 'circle'
  id: string
  cx: number
  cy: number
  radius: number
}

/**
 * Axis-aligned-like rectangle. Geometry is stored in world frame after
 * the scenario loader normalized it (centre + half-extents + yaw).
 * During raycasting the ray is inverse-rotated into local frame and then
 * tested against an AABB.
 */
export interface RectangleShape2D {
  kind: 'rectangle'
  id: string
  /** World-space centre x (metres). */
  cx: number
  /** World-space centre y (metres). */
  cy: number
  /** Full extent along local +X (metres). */
  length: number
  /** Full extent along local +Y (metres). */
  thickness: number
  /** Orientation of local +X from world +X, CCW (radians). */
  yaw: number
}

export type LidarRaycastShape2D = CircleShape2D | RectangleShape2D

/**
 * Cast a single ray against a list of shapes and return the closest hit.
 * Returns `undefined` when no shape is hit within `[rangeMin, rangeMax]`.
 */
export function castLidarRay2D(
  input: RaycastInput2D,
  shapes: readonly LidarRaycastShape2D[],
): RaycastHit2D | undefined {
  const dx = Math.cos(input.angle)
  const dy = Math.sin(input.angle)

  let bestRange = input.rangeMax
  let bestShape: LidarRaycastShape2D | undefined

  for (const shape of shapes) {
    let t: number | undefined
    if (shape.kind === 'circle') {
      t = rayVsCircle(input.origin.x, input.origin.y, dx, dy, shape)
    } else {
      t = rayVsRectangle(input.origin.x, input.origin.y, dx, dy, shape)
    }
    if (t !== undefined && t >= input.rangeMin && t < bestRange) {
      bestRange = t
      bestShape = shape
    }
  }

  if (bestShape === undefined) return undefined

  return {
    range: bestRange,
    point: {
      x: input.origin.x + dx * bestRange,
      y: input.origin.y + dy * bestRange,
    },
    objectId: bestShape.id,
    objectKind: bestShape.kind,
  }
}

// ---------------------------------------------------------------------------
// Internal intersection helpers
// ---------------------------------------------------------------------------

function rayVsCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  shape: CircleShape2D,
): number | undefined {
  const fx = ox - shape.cx
  const fy = oy - shape.cy
  // Quadratic coefficients for ‖(o + t·d) - c‖² = r²
  const a = dx * dx + dy * dy // = 1 for unit direction
  const b = 2 * (fx * dx + fy * dy)
  const c = fx * fx + fy * fy - shape.radius * shape.radius
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return undefined
  const sqrtD = Math.sqrt(discriminant)
  const t1 = (-b - sqrtD) / (2 * a)
  const t2 = (-b + sqrtD) / (2 * a)
  // Return the smallest positive root (entry point).
  if (t1 > 0) return t1
  if (t2 > 0) return t2
  return undefined
}

function rayVsRectangle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  shape: RectangleShape2D,
): number | undefined {
  // Rotate ray origin and direction into rectangle local frame.
  const cosA = Math.cos(-shape.yaw)
  const sinA = Math.sin(-shape.yaw)
  const lox = cosA * (ox - shape.cx) - sinA * (oy - shape.cy)
  const loy = sinA * (ox - shape.cx) + cosA * (oy - shape.cy)
  const ldx = cosA * dx - sinA * dy
  const ldy = sinA * dx + cosA * dy

  const hx = shape.length / 2
  const hy = shape.thickness / 2

  // Slab method: intersect with the two axis-aligned slab pairs.
  let tmin = -Infinity
  let tmax = Infinity

  if (Math.abs(ldx) < 1e-10) {
    if (lox < -hx || lox > hx) return undefined
  } else {
    const t1 = (-hx - lox) / ldx
    const t2 = (hx - lox) / ldx
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
  }

  if (Math.abs(ldy) < 1e-10) {
    if (loy < -hy || loy > hy) return undefined
  } else {
    const t1 = (-hy - loy) / ldy
    const t2 = (hy - loy) / ldy
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
  }

  if (tmin > tmax) return undefined
  if (tmin > 0) return tmin
  if (tmax > 0) return tmax
  return undefined
}
