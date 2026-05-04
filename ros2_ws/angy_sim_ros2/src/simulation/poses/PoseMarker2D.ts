/** A single 2-D pose: position + heading (yaw in radians, +CCW from +X). */
export interface PoseMarker2D {
  x: number
  y: number
  /** Heading in radians, counter-clockwise from the +X axis. */
  yaw: number
}
