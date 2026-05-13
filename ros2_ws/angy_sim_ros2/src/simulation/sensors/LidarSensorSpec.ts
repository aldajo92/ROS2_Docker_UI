/**
 * Noise configuration for a simulated 2-D lidar sensor.
 * All fields are optional; defaults produce noiseless output when
 * `enabled` is absent or `false`.
 */
export interface LidarNoiseConfig {
  /** Set to `true` to apply noise. Default: false. */
  enabled?: boolean
  /** Gaussian standard deviation added to each range reading (metres). */
  rangeStdDev?: number
  /** Constant bias added to every range reading (metres). */
  rangeBias?: number
  /** Angular jitter std dev (radians). Applied to the ray angle before
   *  casting. Not yet implemented in the first pass. */
  angularStdDev?: number
  /** Probability in [0, 1] that a ray returns `rangeMax` (dropped). */
  dropoutProbability?: number
  /** Probability in [0, 1] that a ray is replaced by a random outlier
   *  in `[outlierMinRange, outlierMaxRange]`. */
  outlierProbability?: number
  /** Lower bound for outlier range (metres). */
  outlierMinRange?: number
  /** Upper bound for outlier range (metres). */
  outlierMaxRange?: number
  /** Quantize each range to the nearest multiple of this step (metres).
   *  Use `0.001` for millimetre resolution. */
  quantizationStep?: number
  /** RNG seed for reproducible noise. Uses `Math.random()` when absent. */
  seed?: number
}

/**
 * Scenario-declared configuration for one simulated 2-D lidar sensor.
 *
 * Parsed by `ScenarioLoader` and forwarded to `LidarSensorSystem`
 * via `SimulationEngine.loadScenario`. No ROS types here — this is
 * simulation-only.
 */
export interface LidarSensorSpec {
  /** Discriminator — only `'lidar2d'` is currently supported. */
  kind: 'lidar2d'
  /** Unique sensor id within the scenario. */
  id: string
  /** Entity the sensor is mounted on. Sensor pose is relative to this
   *  entity's pose when set; world-frame when absent. */
  parentEntityId?: string
  /** ROS frame id attached to emitted scans (informational). */
  frameId?: string
  /** Sensor pose relative to parent entity (or world if no parent).
   *  Defaults to identity (origin, yaw 0). */
  pose?: { x: number; y: number; yaw?: number }

  /** Whether the sensor is active. Default: true. */
  enabled?: boolean
  /** Scan rate in Hz. Must be finite and > 0. Default: 10. */
  rateHz?: number

  /** Scan start angle (radians, CCW from sensor +X). */
  angleMin: number
  /** Scan end angle (radians, CCW from sensor +X). Must be > angleMin. */
  angleMax: number
  /** Number of rays. Must be an integer >= 2. */
  rayCount: number

  /** Minimum measurable range (metres). Must be finite and >= 0. */
  rangeMin: number
  /** Maximum measurable range (metres). Must be finite and > rangeMin. */
  rangeMax: number

  /** Cast rays against static obstacle entities. Default: true. */
  includeStaticObstacles?: boolean
  /** Cast rays against vehicle entities. Default: false. */
  includeVehicles?: boolean
  /** Cast rays against dynamic actor entities. Default: false. */
  includeDynamicActors?: boolean

  noise?: LidarNoiseConfig
}
