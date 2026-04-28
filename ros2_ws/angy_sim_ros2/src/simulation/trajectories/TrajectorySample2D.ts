export type TrajectorySample2D = {
  /** Simulation time in seconds. */
  timeSec: number
  /** Simulation X coordinate in meters. */
  x: number
  /** Simulation Y coordinate in meters. */
  y: number
  /** Optional heading in radians. */
  yaw?: number
  /** Optional scalar speed in m/s. */
  speed?: number
}
