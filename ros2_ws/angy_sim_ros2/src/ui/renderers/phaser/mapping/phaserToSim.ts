import { Point2D } from '../../../../math/geometry/Point2D'
import type { PhaserPoint2D, PhaserViewport } from './simToPhaser'

/**
 * Inverse of `simToPhaser.ts`. Used by interaction code that picks a
 * point on the canvas (clicks, drags, hover) and needs to know where
 * that lands in the simulation frame — for example, to seed a path
 * editor in sim meters rather than pixels.
 *
 * Like its sibling, this module has no `phaser` import; it deals only
 * with plain `{ x, y }` records.
 */

/** Phaser canvas point (px) → sim 2D point (m). */
export function phaserPointToSimPoint2D(
  point: PhaserPoint2D,
  viewport: PhaserViewport,
): Point2D {
  return Point2D.of(
    (point.x - viewport.originX) / viewport.pixelsPerMeter,
    -(point.y - viewport.originY) / viewport.pixelsPerMeter,
  )
}

/** Phaser GameObject rotation (rad, CW positive) → sim yaw (CCW from +X). */
export function phaserRotationToSimYaw(rotation: number): number {
  return -rotation
}

/** Pixels → meters (magnitude only — does not apply origin offset). */
export function phaserLengthToSim(
  pixels: number,
  pixelsPerMeter: number,
): number {
  return pixels / pixelsPerMeter
}
