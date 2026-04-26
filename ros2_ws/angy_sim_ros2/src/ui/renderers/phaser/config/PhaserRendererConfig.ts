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

/** Per-feature config for the vehicle trail visualization in Phaser.
 *  Mirrors `ThreeTrailConfig` field-for-field where it makes sense, so
 *  Inspector code can be reused or aligned across renderers. */
export interface PhaserTrailConfig {
  enabled: boolean
  /** Sliding-window cap (≥ 2). Acts as a hard buffer cap. */
  maxPoints: number
  /** Minimum sim-meters of motion required between samples. Zero means
   *  "sample even if stopped". */
  minDistance: number
  /** CSS-style hex color string, e.g. `"#ff5050"`. */
  color: string
  /** Clamped to [0, 1]. < 1 forces the line to draw transparent. */
  opacity: number
  /** Stroke width in screen pixels. Honored by `Graphics.lineStyle`. */
  lineWidth: number
}

export const DEFAULT_PHASER_TRAIL_CONFIG: PhaserTrailConfig = {
  enabled: true,
  maxPoints: 500,
  minDistance: 0,
  color: '#ff5050',
  opacity: 1.0,
  lineWidth: 2,
}

export interface PhaserRendererConfig {
  /** Screen pixels per simulation meter at canvas-fit zoom = 1. */
  pixelsPerMeter: number
  /** Draw the metric grid behind everything else. */
  showGrid: boolean
  /** Draw the sim-axes gizmo (red X, green Y) at the origin. */
  showAxes: boolean
  /** Draw bounding circles + heading arrows on top of entities. */
  showDebug: boolean
  /** Draw vehicle trails (renderer-owned visual history). */
  showTrails: boolean
  /** Canvas background color (CSS hex). */
  backgroundColor: string
  /** Trail rendering parameters. */
  trail: PhaserTrailConfig
}

export const DEFAULT_PHASER_RENDERER_CONFIG: PhaserRendererConfig = {
  pixelsPerMeter: 60,
  showGrid: true,
  showAxes: true,
  showDebug: true,
  showTrails: true,
  backgroundColor: '#1e1e1e',
  trail: DEFAULT_PHASER_TRAIL_CONFIG,
}
