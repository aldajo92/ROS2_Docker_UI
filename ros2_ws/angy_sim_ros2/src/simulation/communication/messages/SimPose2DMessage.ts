/**
 * Flat, JSON-friendly 2D pose. Intentionally NOT the engine's
 * `Pose2D` class — this lives at the communication boundary, where
 * structural cloning, JSON.stringify, and equality-by-value matter
 * more than method ergonomics.
 *
 * Units: meters (x, y), radians CCW from +X (yaw), per the engine
 * convention documented in `doc/Considerations.md`.
 */
export interface SimPose2DMessage {
  x: number
  y: number
  yaw: number
}
