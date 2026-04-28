import type Phaser from 'phaser'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import {
  DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG,
  type PhaserTrajectoryVisualizationConfig,
} from '../config/PhaserRendererConfig'
import { simPoint2DToPhaser } from '../mapping/simToPhaser'

export type PhaserTrajectoryEntityDebug = {
  entityId: string
  sampleCount: number
  hasGraphics: boolean
  visible: boolean
  attachedToScene: boolean
  drawnPointCount: number
  lineColor: string
  lineOpacity: number
  lineWidth: number
  firstScreenPoint?: { x: number; y: number }
  lastScreenPoint?: { x: number; y: number }
}

export type PhaserTrajectoryRendererDebugSummary = {
  enabled: boolean
  trajectoryCount: number
  totalSampleCount: number
  perEntity: PhaserTrajectoryEntityDebug[]
}

/**
 * Read-only consumer of `state.trajectories` for the Phaser 2D
 * adapter. One `Phaser.GameObjects.Graphics` per entity; the polyline
 * is fully redrawn from the simulation samples on every sync.
 *
 * The renderer NEVER mutates `SimulationState`. It does NOT sample,
 * filter, cap, or interpolate — sampling is owned by
 * `TrajectoryTrackingSystem`.
 *
 * Mirrors `ThreeTrajectoryRenderer` so the App-level Inspector / debug
 * surface looks the same regardless of active renderer.
 */
export class PhaserTrajectoryRenderer {
  private readonly context: PhaserSceneContext
  private config: PhaserTrajectoryVisualizationConfig
  private readonly graphics = new Map<string, Phaser.GameObjects.Graphics>()
  private readonly lastSeenSamples = new Map<string, number>()
  private readonly lastDrawnPoints = new Map<
    string,
    { firstScreen?: { x: number; y: number }; lastScreen?: { x: number; y: number }; count: number }
  >()
  private lastTrajectoryCount = 0
  private lastTotalSampleCount = 0

  constructor(
    context: PhaserSceneContext,
    config: Partial<PhaserTrajectoryVisualizationConfig> = {},
  ) {
    this.context = context
    this.config = sanitize({
      ...DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG,
      ...config,
    })
  }

  sync(state: SimulationState): void {
    if (!this.config.enabled) {
      for (const g of this.graphics.values()) g.setVisible(false)
      this.captureSyncStats(state)
      return
    }

    const trajectories = state.trajectories.toArray()
    const activeIds = this.collectActiveIds(trajectories)
    this.removeStaleGraphics(activeIds)

    for (const trajectory of trajectories) {
      if (trajectory.samples.length === 0) continue
      const g = this.ensureGraphics(trajectory.entityId)
      g.setVisible(true)
      this.repaint(g, trajectory.entityId, trajectory.samples)
    }
    this.captureSyncStats(state)
  }

  setConfig(partial: Partial<PhaserTrajectoryVisualizationConfig>): void {
    this.config = sanitize({ ...this.config, ...partial })
    // Re-stroke every existing graphics with the new visual params.
    // Sample data is the simulation's; we don't keep a copy here, so a
    // genuine "redraw with new color" needs the latest samples — that
    // happens on the next sync. Visibility we can flip immediately.
    for (const g of this.graphics.values()) g.setVisible(this.config.enabled)
  }

  setEnabled(enabled: boolean): void {
    this.setConfig({ enabled })
  }

  getConfig(): PhaserTrajectoryVisualizationConfig {
    return { ...this.config }
  }

  /**
   * Drop every cached `Graphics` object. The next sync will rebuild
   * lines from `state.trajectories`. Use after a viewport resize when
   * you want a clean repaint, or for parity with the Three renderer's
   * `clearRenderCache()`.
   */
  clearRenderCache(): void {
    const ids: string[] = []
    this.graphics.forEach((_g, id) => ids.push(id))
    for (const id of ids) this.removeGraphics(id)
    this.lastDrawnPoints.clear()
  }

  /** No-op repaint hook for resize. Next sync will redraw from samples. */
  reproject(): void {
    // The renderer does not store sim samples; the next `sync()` call
    // (issued by the viewport on Phaser scale 'resize') will repaint
    // every graphics from the simulation registry, picking up the new
    // viewport origin automatically.
  }

  dispose(): void {
    this.clearRenderCache()
  }

  getDebugSummary(): PhaserTrajectoryRendererDebugSummary {
    const ids = new Set<string>()
    this.lastSeenSamples.forEach((_count, id) => ids.add(id))
    this.graphics.forEach((_g, id) => ids.add(id))

    const perEntity: PhaserTrajectoryEntityDebug[] = []
    ids.forEach((id) => perEntity.push(this.buildEntityDebug(id)))

    return {
      enabled: this.config.enabled,
      trajectoryCount: this.lastTrajectoryCount,
      totalSampleCount: this.lastTotalSampleCount,
      perEntity,
    }
  }

  private collectActiveIds(
    trajectories: ReadonlyArray<{
      entityId: string
      samples: ReadonlyArray<unknown>
    }>,
  ): Set<string> {
    const ids = new Set<string>()
    for (const t of trajectories) if (t.samples.length > 0) ids.add(t.entityId)
    return ids
  }

  private removeStaleGraphics(activeIds: Set<string>): void {
    const stale: string[] = []
    for (const id of this.graphics.keys()) {
      if (!activeIds.has(id)) stale.push(id)
    }
    for (const id of stale) this.removeGraphics(id)
  }

  private ensureGraphics(entityId: string): Phaser.GameObjects.Graphics {
    const existing = this.graphics.get(entityId)
    if (existing) return existing
    const g = this.context.scene.add.graphics()
    g.setName(`trajectory:${entityId}`)
    this.graphics.set(entityId, g)
    return g
  }

  private repaint(
    g: Phaser.GameObjects.Graphics,
    entityId: string,
    samples: ReadonlyArray<{ x: number; y: number }>,
  ): void {
    g.clear()
    if (samples.length < 2) {
      this.lastDrawnPoints.set(entityId, { count: samples.length })
      return
    }
    const colorInt = parseHexColor(this.config.color)
    g.lineStyle(this.config.lineWidth, colorInt, this.config.opacity)
    g.beginPath()
    const start = simPoint2DToPhaser(
      Point2D.of(samples[0].x, samples[0].y),
      this.context.viewport,
    )
    g.moveTo(start.x, start.y)
    let lastScreen = start
    for (let i = 1; i < samples.length; i++) {
      const screen = simPoint2DToPhaser(
        Point2D.of(samples[i].x, samples[i].y),
        this.context.viewport,
      )
      g.lineTo(screen.x, screen.y)
      lastScreen = screen
    }
    g.strokePath()
    this.lastDrawnPoints.set(entityId, {
      firstScreen: { x: start.x, y: start.y },
      lastScreen: { x: lastScreen.x, y: lastScreen.y },
      count: samples.length,
    })
  }

  private removeGraphics(id: string): void {
    const g = this.graphics.get(id)
    if (!g) return
    g.destroy()
    this.graphics.delete(id)
  }

  private captureSyncStats(state: SimulationState): void {
    const trajectories = state.trajectories.toArray()
    this.lastTrajectoryCount = trajectories.length
    this.lastSeenSamples.clear()
    let total = 0
    for (const t of trajectories) {
      this.lastSeenSamples.set(t.entityId, t.samples.length)
      total += t.samples.length
    }
    this.lastTotalSampleCount = total
  }

  private buildEntityDebug(id: string): PhaserTrajectoryEntityDebug {
    const sampleCount = this.lastSeenSamples.get(id) ?? 0
    const g = this.graphics.get(id)
    if (!g) {
      return {
        entityId: id,
        sampleCount,
        hasGraphics: false,
        visible: false,
        attachedToScene: false,
        drawnPointCount: 0,
        lineColor: this.config.color,
        lineOpacity: this.config.opacity,
        lineWidth: this.config.lineWidth,
      }
    }
    const drawn = this.lastDrawnPoints.get(id)
    return {
      entityId: id,
      sampleCount,
      hasGraphics: true,
      visible: g.visible,
      attachedToScene: g.scene === this.context.scene,
      drawnPointCount: drawn?.count ?? 0,
      lineColor: this.config.color,
      lineOpacity: this.config.opacity,
      lineWidth: this.config.lineWidth,
      firstScreenPoint: drawn?.firstScreen,
      lastScreenPoint: drawn?.lastScreen,
    }
  }
}

function sanitize(
  config: PhaserTrajectoryVisualizationConfig,
): PhaserTrajectoryVisualizationConfig {
  return {
    enabled: config.enabled,
    color: config.color,
    opacity: clamp01(config.opacity),
    lineWidth: Math.max(1, config.lineWidth),
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}

function parseHexColor(hex: string): number {
  const stripped = hex.startsWith('#') ? hex.slice(1) : hex
  const n = Number.parseInt(stripped, 16)
  return Number.isFinite(n) ? n : 0xff5050
}
