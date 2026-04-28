import type { CameraMode } from '../cameras/CameraMode'
import type { Projection } from '../cameras/Projection'

/**
 * Visual style only for entity trajectories read from
 * `state.trajectories`. Sampling (mode, max samples, time window,
 * min dt, min distance) is configured in the simulation via
 * `TrajectoryTrackingSystem` / scenario `trajectoryTracking` — not
 * here.
 */
export type ThreeTrajectoryVisualizationConfig = {
  enabled: boolean
  height: number
  color: string
  opacity: number
  lineWidth: number
}

export const DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG = {
  enabled: true,
  height: 0.03,
  color: '#ff5050',
  opacity: 1.0,
  lineWidth: 2,
} satisfies ThreeTrajectoryVisualizationConfig

/**
 * @deprecated Use {@link ThreeTrajectoryVisualizationConfig}. Kept
 *   temporarily so older imports fail loudly at type level during
 *   migration; visual fields map to the new struct.
 */
export type ThreeTrailConfig = ThreeTrajectoryVisualizationConfig & {
  samplingMode?: never
  maxPoints?: never
  timeWindowSec?: never
  minSampleDtSec?: never
  minDistance?: never
}

/** @deprecated Use DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG */
export const DEFAULT_THREE_TRAIL_CONFIG: ThreeTrailConfig = {
  ...DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG,
}

/** @deprecated prefer TrailSamplingMode from simulation trajectory config */
export type TrailSamplingMode = 'pointCount' | 'timeWindow'

/**
 * Visual / behavioral switches for the Three.js renderer. Renderers
 * read these once at construction and on `setConfig`; they do NOT
 * read them again per frame, so toggles are cheap.
 */
export interface ThreeRendererConfig {
  showGrid: boolean
  showAxes: boolean
  showDebug: boolean
  trajectoryVisualization: ThreeTrajectoryVisualizationConfig
  cameraMode: CameraMode
  projection: Projection
  /** Vertical world-space extent of the orthographic frustum (m).
   *  Width is derived from the canvas aspect ratio. */
  orthoFrustumHeight: number
}

export const DEFAULT_THREE_RENDERER_CONFIG: ThreeRendererConfig = {
  showGrid: true,
  showAxes: true,
  showDebug: true,
  trajectoryVisualization: DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG,
  cameraMode: 'orbit',
  projection: 'perspective',
  orthoFrustumHeight: 20,
}
