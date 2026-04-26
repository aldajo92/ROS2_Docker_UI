/**
 * Documentation-only constants for the simulation ↔ Phaser
 * coordinate mapping. Mirrors the role of `three/mapping/coordinateConventions.ts`
 * but for the Phaser 2D screen-space target.
 *
 * Simulation engine convention (right-handed, Z-up):
 *
 *     +X right, +Y forward, +Z up
 *     yaw in radians, CCW positive from +X about +Z
 *
 * Phaser canvas convention (screen space):
 *
 *     +X right, +Y down  (origin is top-left of the canvas)
 *     `setRotation(r)` is in radians; visually positive rotation is
 *     **clockwise** because it rotates the local +X axis toward the
 *     screen +Y axis (which points down).
 *
 * Mapping used everywhere in this renderer:
 *
 *     phaser.x = originX + sim.x * pixelsPerMeter
 *     phaser.y = originY - sim.y * pixelsPerMeter      (Y is FLIPPED)
 *
 * The Y flip puts simulation +Y at the **top** of the screen, which is
 * what we want for a 2D top-down view that reads like the Three.js
 * top-down camera (sim +X right, sim +Y up).
 *
 * Yaw mapping under this convention:
 *
 *   At yaw = +π/2, the sim heading goes from +X to +Y. After the Y
 *   flip that is screen-right → screen-up — visually counter-clockwise.
 *   Phaser's positive rotation is clockwise on screen, so to make a
 *   positive sim yaw appear CCW we negate it:
 *
 *     phaser.rotation = -yaw
 *
 * Vehicle sprite local forward is +X (matches the 3D renderer
 * convention encoded in `simYawToThreeRotationY`). Object renderers
 * MUST NOT bake their own yaw conversion — always go through
 * `simYawToPhaserRotation`.
 */

export const SIM_COORDINATE_CONVENTION = {
  handedness: 'right-handed',
  x: '+X right',
  y: '+Y forward',
  z: '+Z up (ignored by 2D renderer)',
  angleUnit: 'radians',
  distanceUnit: 'meters',
} as const

export const PHASER_COORDINATE_MAPPING = {
  simX: 'phaser.x = originX + sim.x * pixelsPerMeter',
  simY: 'phaser.y = originY - sim.y * pixelsPerMeter',
  yaw: 'phaser.rotation = -yaw',
  yAxis: 'flipped (Phaser +Y is screen-down; we want sim +Y on top)',
} as const

export const VEHICLE_SPRITE_FORWARD_AXIS = '+X' as const
