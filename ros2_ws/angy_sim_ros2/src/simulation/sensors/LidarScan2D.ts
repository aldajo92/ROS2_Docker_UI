/**
 * A single 2-D lidar scan snapshot. JSON-safe by construction so it can
 * be embedded in {@link SimulationFrameSnapshot} and round-trip through
 * JSON.stringify / JSON.parse without losing fidelity.
 *
 * Encoding rules:
 *   - `ranges.length` must equal the ray count implied by
 *     `(angleMax - angleMin) / angleIncrement`.
 *   - No-hit and dropout rays are encoded as `rangeMax` (finite), never
 *     as NaN or Infinity, so JSON stays valid.
 *   - All values are in SI units (meters, radians).
 */
export interface LidarScan2D {
  /** Unique scan id. Typically the sensor id so the registry stores the
   *  latest scan per sensor (upsert semantics). */
  id: string
  /** Id of the {@link LidarSensorSpec} that produced this scan. */
  sensorId: string
  parentEntityId?: string
  frameId?: string
  /** Simulation time when this scan was produced (seconds). */
  timeSec: number

  /** Start angle of the scan (radians, CCW from sensor +X). */
  angleMin: number
  /** End angle of the scan (radians, CCW from sensor +X). */
  angleMax: number
  /** Angular step between consecutive rays (radians). */
  angleIncrement: number

  /** Minimum measurable range (meters). Readings below this are masked. */
  rangeMin: number
  /** Maximum measurable range (meters). No-hit rays carry this value. */
  rangeMax: number

  /** One range reading per ray, in metres. Length == ray count. */
  ranges: number[]
  /** Optional per-ray intensities. Same length as `ranges` when present. */
  intensities?: number[]

  /**
   * World-space sensor origin X at the time this scan was produced (metres).
   * Stored so renderers can draw rays from the correct world position without
   * re-resolving the parent entity pose. Optional for backward compatibility
   * with replay files written before this field existed (renderers fall back
   * to 0 when absent).
   */
  originX?: number
  /** World-space sensor origin Y at the time this scan was produced (metres). */
  originY?: number
  /**
   * World-space sensor yaw at the time this scan was produced (radians).
   * Combined with the local `angleMin`/`angleMax` by renderers to reconstruct
   * world-space ray directions.
   */
  worldYaw?: number

  metadata?: Record<string, unknown>
}
