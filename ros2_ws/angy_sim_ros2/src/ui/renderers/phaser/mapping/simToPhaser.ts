import type { Point2D } from '../../../../math/geometry/Point2D'
import type { Vector2D } from '../../../../math/geometry/Vector2D'

/**
 * Single source of truth for translating simulation coordinates into
 * Phaser screen coordinates. Object renderers and debug renderers must
 * never encode this mapping themselves — always go through these
 * helpers, so a future change of convention (e.g. a different camera
 * origin or pixel scale) is a one-file edit.
 *
 * NOTE: this module deliberately has zero `phaser` imports. It speaks
 * only in plain `{ x, y }` records and primitive numbers. That keeps
 * the unit tests free of Phaser's DOM/canvas dependency, and makes it
 * possible to compute layouts before any scene exists.
 *
 * See `coordinateConventions.ts` for the full mapping derivation.
 */

/** Plain 2D screen-space record returned by mapping helpers. */
export interface PhaserPoint2D {
  x: number
  y: number
}

/** Per-call viewport parameters. The renderer keeps a live instance of
 *  this and threads it through every helper invocation; nothing here
 *  is global state. */
export interface PhaserViewport {
  /** Canvas-space X (px) of the simulation origin. */
  originX: number
  /** Canvas-space Y (px) of the simulation origin. */
  originY: number
  /** Screen pixels per simulation meter. Strictly positive. */
  pixelsPerMeter: number
}

/* -- point / vector mapping ------------------------------------------ */

/** Sim 2D point (on the ground plane) → Phaser canvas position. */
export function simPoint2DToPhaser(
  point: Point2D,
  viewport: PhaserViewport,
): PhaserPoint2D {
  return {
    x: viewport.originX + point.x * viewport.pixelsPerMeter,
    y: viewport.originY - point.y * viewport.pixelsPerMeter,
  }
}

/** Sim 2D vector (displacement, no origin offset) → Phaser displacement.
 *  Useful for arrow tips, velocity vectors, etc. */
export function simVector2DToPhaser(
  vector: Vector2D,
  pixelsPerMeter: number,
): PhaserPoint2D {
  return {
    x: vector.x * pixelsPerMeter,
    y: -vector.y * pixelsPerMeter,
  }
}

/** Sim length in meters → Phaser length in pixels. Use this for radii,
 *  axis lengths, body sizes — anything that's a magnitude rather than
 *  a position. */
export function simLengthToPhaser(
  meters: number,
  pixelsPerMeter: number,
): number {
  return meters * pixelsPerMeter
}

/* -- yaw -------------------------------------------------------------- */

/**
 * Convert simulation yaw (CCW from +X about sim +Z) into a Phaser
 * GameObject rotation in radians, assuming the sprite's local
 * forward is +X.
 *
 * Phaser screen-space rotation is positive **clockwise** (because
 * `setRotation(r)` rotates local +X toward local +Y, and Phaser's +Y
 * points down). We flip the sim screen Y axis when placing the
 * sprite, so a CCW sim rotation must appear CCW on screen — which
 * means we negate.
 *
 *   sim yaw = +π/2  →  sim heading +X → +Y (which we render to
 *                      screen-right → screen-up, i.e. CCW)
 *   phaser rotation = -π/2  →  sprite forward goes screen-right →
 *                              screen-up (CCW). ✓
 */
export function simYawToPhaserRotation(yaw: number): number {
  return -yaw
}
