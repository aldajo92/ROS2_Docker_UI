import type { CameraMode } from '../cameras/CameraMode'
import type { Projection } from '../cameras/Projection'

/**
 * Sampling strategies for the vehicle trail.
 *
 *   - `pointCount`  — keep the last `maxPoints` appended samples.
 *                     Appends on every sync (subject to `minDistance`),
 *                     so a stationary vehicle still grows the trail
 *                     up to the cap. This is the historical default.
 *   - `timeWindow`  — keep samples within the last `timeWindowSec`
 *                     of *simulation* time. `minSampleDtSec` throttles
 *                     append frequency, `maxPoints` is a hard safety
 *                     cap so the buffer can never run away.
 *
 * Both modes use sim time (`state.clock.time()`), never wall-clock,
 * so a paused engine produces a paused trail.
 */
export type TrailSamplingMode = 'pointCount' | 'timeWindow'

/**
 * Per-feature config for the vehicle trail visualization. Owned by
 * the renderer (not the simulation), so the Inspector can tune it
 * without touching `SimulationState` or `VehicleEntity`.
 *
 *   - `enabled`        — when false, the renderer hides every trail line
 *                        and stops sampling new points. The internal
 *                        buffer is preserved so flipping back to true
 *                        resumes from where it left off; only `clear()`
 *                        drops history.
 *   - `samplingMode`   — `pointCount` (default, last-N samples) or
 *                        `timeWindow` (last-N-seconds of sim time).
 *   - `maxPoints`      — sliding-window size per vehicle (≥ 2). Acts
 *                        as a hard cap in both modes; in `timeWindow`
 *                        it's a safety net against unbounded growth.
 *   - `timeWindowSec`  — only used in `timeWindow` mode. Samples older
 *                        than `currentSimTime - timeWindowSec` are
 *                        pruned each sync. Must be > 0.
 *   - `minSampleDtSec` — only used in `timeWindow` mode. Minimum sim
 *                        time between consecutive appends; throttles
 *                        append rate at high tick frequencies. Zero
 *                        means "append on every tick".
 *   - `minDistance`    — sim-meters of motion required between samples.
 *                        Zero means "sample even if stopped"; larger
 *                        values give a sparser, longer-reaching trail.
 *                        Applied in both modes.
 *   - `height`         — meters above the ground plane that trail
 *                        vertices render at. Lifts the line off the
 *                        grid to avoid z-fighting.
 *   - `color`          — CSS-style hex string ("#rrggbb"). Three.js
 *                        parses it via `new THREE.Color(string)`.
 *   - `opacity`        — clamped to [0, 1]. < 1 forces the material
 *                        transparent.
 *   - `lineWidth`      — best-effort. `THREE.LineBasicMaterial.linewidth`
 *                        is ignored by most desktop WebGL implementations
 *                        (only `Line2` / fat-line shaders honor it). We
 *                        still store + forward it so the Inspector value
 *                        is the source of truth on platforms that do.
 */
export interface ThreeTrailConfig {
  enabled: boolean
  samplingMode: TrailSamplingMode
  maxPoints: number
  timeWindowSec: number
  minSampleDtSec: number
  minDistance: number
  height: number
  color: string
  opacity: number
  lineWidth: number
}

export const DEFAULT_THREE_TRAIL_CONFIG: ThreeTrailConfig = {
  enabled: true,
  samplingMode: 'pointCount',
  maxPoints: 500,
  timeWindowSec: 10,
  minSampleDtSec: 0,
  // Default to 0 so a stopped vehicle keeps appending samples in
  // `pointCount` mode, matching the user-visible "last 500 samples"
  // mental model.
  minDistance: 0,
  height: 0.05,
  color: '#ff5050',
  opacity: 1.0,
  lineWidth: 2,
}

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
  trail: ThreeTrailConfig
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
  trail: DEFAULT_THREE_TRAIL_CONFIG,
  // Default to interactive orbit so users get drag-rotate / wheel-zoom
  // immediately, matching the angelos_sim_ros2 dev-cell behavior.
  cameraMode: 'orbit',
  projection: 'perspective',
  orthoFrustumHeight: 20,
}
