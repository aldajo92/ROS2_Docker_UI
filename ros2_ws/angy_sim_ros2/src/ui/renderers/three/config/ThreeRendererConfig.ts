import type { CameraMode } from '../cameras/CameraMode'
import type { Projection } from '../cameras/Projection'

/**
 * Visual / behavioral switches for the Three.js renderer. Renderers
 * read these once at construction and on `setConfig`; they do NOT
 * read them again per frame, so toggles are cheap.
 *
 * Keep this struct small. New options should only land here if at
 * least two sub-renderers care about them — single-renderer flags
 * belong on that renderer's own constructor options.
 */
export interface ThreeRendererConfig {
  showGrid: boolean
  showAxes: boolean
  showDebug: boolean
  /** Max points retained per vehicle trail. */
  trailLength: number
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
  trailLength: 200,
  // Default to interactive orbit so users get drag-rotate / wheel-zoom
  // immediately, matching the angelos_sim_ros2 dev-cell behavior.
  cameraMode: 'orbit',
  projection: 'perspective',
  orthoFrustumHeight: 20,
}
