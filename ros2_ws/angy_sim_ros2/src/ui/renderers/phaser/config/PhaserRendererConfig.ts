/**
 * Renderer-owned visual / behavioral switches for the Phaser 2D
 * renderer. Equivalent in spirit to `ThreeRendererConfig`, kept
 * intentionally small: the Phaser viewport is a top-down 2D map and
 * does not need the camera-mode / projection vocabulary the Three.js
 * adapter has.
 *
 * Like `ThreeRendererConfig`, the renderer reads these at construction
 * and on `setConfig`; per-frame reads are not encouraged.
 */

/**
 * Trajectory **visualization** style for the Phaser 2D adapter.
 * The Phaser renderer is a read-only consumer of `state.trajectories`
 * (the simulation owns sampling). This config controls how those
 * simulation-owned trajectories are *drawn*; nothing here affects
 * sampling cadence, sample retention, or sample selection.
 *
 * Mirrors `ThreeTrajectoryVisualizationConfig` minus the 3D-only
 * `height` field.
 */
export interface PhaserTrajectoryVisualizationConfig {
  enabled: boolean
  /** CSS-style hex color string, e.g. `"#ff5050"`. */
  color: string
  /** Clamped to [0, 1]. < 1 forces the line to draw transparent. */
  opacity: number
  /** Stroke width in screen pixels. Honored by `Graphics.lineStyle`. */
  lineWidth: number
}

export const DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG: PhaserTrajectoryVisualizationConfig = {
  enabled: true,
  color: '#ff5050',
  opacity: 1,
  lineWidth: 2,
}

/**
 * @deprecated Use {@link PhaserTrajectoryVisualizationConfig}. The
 * `maxPoints`/`minDistance` knobs no longer apply: sampling lives in
 * `TrajectoryTrackingSystem` and is configured via
 * `controller.setTrajectoryTrackingConfig` (or scenario JSON).
 */
export type PhaserTrailConfig = PhaserTrajectoryVisualizationConfig

/** @deprecated Use {@link DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG}. */
export const DEFAULT_PHASER_TRAIL_CONFIG: PhaserTrajectoryVisualizationConfig =
  DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG

export interface PhaserRendererConfig {
  /** Screen pixels per simulation meter at canvas-fit zoom = 1. */
  pixelsPerMeter: number
  /** Draw the metric grid behind everything else. */
  showGrid: boolean
  /** Draw the sim-axes gizmo (red X, green Y) at the origin. */
  showAxes: boolean
  /** Draw bounding circles + heading arrows on top of entities. */
  showDebug: boolean
  /** Draw simulation-owned trajectories on top of entities. */
  showTrajectories: boolean
  /** Canvas background color (CSS hex). */
  backgroundColor: string
  /** How simulation-owned trajectories are drawn. */
  trajectoryVisualization: PhaserTrajectoryVisualizationConfig
}

export const DEFAULT_PHASER_RENDERER_CONFIG: PhaserRendererConfig = {
  pixelsPerMeter: 60,
  showGrid: true,
  showAxes: true,
  showDebug: true,
  showTrajectories: true,
  backgroundColor: '#1e1e1e',
  trajectoryVisualization: DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG,
}
