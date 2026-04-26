import type Phaser from 'phaser'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import {
  DEFAULT_PHASER_TRAIL_CONFIG,
  type PhaserTrailConfig,
} from '../config/PhaserRendererConfig'
import { simPoint2DToPhaser } from '../mapping/simToPhaser'

/**
 * Visual-only breadcrumb trail for vehicles in Phaser. Trail points
 * live ONLY in this renderer — never on the entity — so swapping
 * renderers or disabling visuals doesn't leak memory in the simulation
 * core.
 *
 * Sampling strategy: simple `pointCount` — append every sync, keep the
 * last `maxPoints`, gate by `minDistance` if non-zero. Time-window
 * sampling is intentionally NOT implemented here; the Three.js trail
 * renderer remains the reference implementation for the time-window
 * mode, and porting it 1:1 to Phaser is straightforward but out of
 * scope for the initial Phaser adapter.
 *
 * Geometry strategy: each trail is a Phaser `Graphics` object that we
 * `clear()` and redraw from the in-memory point buffer on every sync.
 * The `Graphics` API doesn't have an analogue of Three.js's pre-
 * allocated `BufferAttribute` — but at `maxPoints = 500`, redrawing
 * the whole polyline is cheap (one `strokePath` per vehicle, runs
 * inside Phaser's batched 2D context).
 *
 * The renderer NEVER mutates `SimulationState`. It only reads
 * `vehicle.pose.position`.
 */
export class PhaserTrailRenderer {
  private readonly context: PhaserSceneContext
  private config: PhaserTrailConfig
  /** Per-vehicle Graphics object that draws the trail polyline. */
  private readonly graphics = new Map<string, Phaser.GameObjects.Graphics>()
  /** Per-vehicle sim-frame point history. Plain `Point2D[]` so a
   *  resize can re-project the buffer without waiting for a new sync. */
  private readonly samples = new Map<string, Point2D[]>()
  /** Last sim time at which we appended a sample. Repaints driven by
   *  the canvas (resize, config edits) call `sync()` with the same
   *  `state.clock.time()` and must NOT enter the trail history; only
   *  ticks that actually advanced the sim clock should add points. */
  private lastSampledTime: number = Number.NaN

  constructor(
    context: PhaserSceneContext,
    config: PhaserTrailConfig = DEFAULT_PHASER_TRAIL_CONFIG,
  ) {
    this.context = context
    this.config = sanitize({ ...DEFAULT_PHASER_TRAIL_CONFIG, ...config })
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()
    const now = state.clock.time()
    const tickAdvanced = now !== this.lastSampledTime

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      const buffer = this.getOrCreateBuffer(vehicle.id)
      const g = this.getOrCreateGraphics(vehicle.id)

      if (this.config.enabled) {
        if (tickAdvanced) {
          this.appendIfAllowed(buffer, vehicle.pose.position)
          this.trimToMaxPoints(buffer)
        }
        // Always repaint so config edits / canvas resize take effect
        // even on non-tick syncs.
        this.repaint(g, buffer)
      }
      g.setVisible(this.config.enabled)
    }

    if (tickAdvanced) this.lastSampledTime = now

    for (const [id, g] of [...this.graphics.entries()]) {
      if (!liveIds.has(id)) {
        g.destroy()
        this.graphics.delete(id)
        this.samples.delete(id)
      }
    }
  }

  /** Wipe every per-vehicle history. Graphics objects are kept around
   *  so the next sync can reuse them, but their drawn content is
   *  cleared immediately so the previous trail disappears even if
   *  `enabled === false`. */
  clear(): void {
    for (const buffer of this.samples.values()) buffer.length = 0
    for (const g of this.graphics.values()) g.clear()
    // Forget the last sim time so the next post-reset tick (which
    // rewinds `state.clock.time()` to 0) is treated as fresh.
    this.lastSampledTime = Number.NaN
  }

  dispose(): void {
    for (const g of this.graphics.values()) g.destroy()
    this.graphics.clear()
    this.samples.clear()
  }

  setConfig(partial: Partial<PhaserTrailConfig>): void {
    this.config = sanitize({ ...this.config, ...partial })
    // Trim immediately if maxPoints shrank.
    for (const buffer of this.samples.values()) this.trimToMaxPoints(buffer)
    // Repaint so color/opacity/lineWidth/visibility take effect on
    // the next browser frame even if the sim is paused.
    for (const [id, g] of this.graphics.entries()) {
      const buffer = this.samples.get(id) ?? []
      this.repaint(g, buffer)
      g.setVisible(this.config.enabled)
    }
  }

  setEnabled(enabled: boolean): void {
    this.setConfig({ enabled })
  }

  getConfig(): PhaserTrailConfig {
    return this.config
  }

  /** Re-project every stored sample after a viewport change (e.g.
   *  canvas resize moved the origin). Cheap because `samples` holds
   *  sim-frame points; we just have to redraw. */
  reproject(): void {
    for (const [id, g] of this.graphics.entries()) {
      const buffer = this.samples.get(id) ?? []
      this.repaint(g, buffer)
    }
  }

  private getOrCreateBuffer(id: string): Point2D[] {
    let buffer = this.samples.get(id)
    if (!buffer) {
      buffer = []
      this.samples.set(id, buffer)
    }
    return buffer
  }

  private getOrCreateGraphics(id: string): Phaser.GameObjects.Graphics {
    let g = this.graphics.get(id)
    if (!g) {
      g = this.context.scene.add.graphics()
      g.setName(`trail:${id}`)
      g.setVisible(this.config.enabled)
      this.graphics.set(id, g)
    }
    return g
  }

  private appendIfAllowed(buffer: Point2D[], position: Point2D): void {
    if (buffer.length === 0) {
      buffer.push(Point2D.of(position.x, position.y))
      return
    }
    if (this.config.minDistance > 0) {
      const last = buffer[buffer.length - 1]
      const dx = position.x - last.x
      const dy = position.y - last.y
      if (dx * dx + dy * dy < this.config.minDistance * this.config.minDistance)
        return
    }
    buffer.push(Point2D.of(position.x, position.y))
  }

  private trimToMaxPoints(buffer: Point2D[]): void {
    if (buffer.length > this.config.maxPoints) {
      buffer.splice(0, buffer.length - this.config.maxPoints)
    }
  }

  private repaint(g: Phaser.GameObjects.Graphics, buffer: Point2D[]): void {
    g.clear()
    if (buffer.length < 2) return
    const colorInt = parseHexColor(this.config.color)
    g.lineStyle(this.config.lineWidth, colorInt, this.config.opacity)
    const start = simPoint2DToPhaser(buffer[0], this.context.viewport)
    g.beginPath()
    g.moveTo(start.x, start.y)
    for (let i = 1; i < buffer.length; i++) {
      const p = simPoint2DToPhaser(buffer[i], this.context.viewport)
      g.lineTo(p.x, p.y)
    }
    g.strokePath()
  }
}

function sanitize(config: PhaserTrailConfig): PhaserTrailConfig {
  return {
    enabled: config.enabled,
    maxPoints: Math.max(2, Math.floor(config.maxPoints)),
    minDistance: Math.max(0, config.minDistance),
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
  // Accepts "#rrggbb" or "rrggbb"; falls back to bright red on parse
  // failure so the trail is still visible (visible failures > silent
  // black lines on a dark background).
  const stripped = hex.startsWith('#') ? hex.slice(1) : hex
  const n = Number.parseInt(stripped, 16)
  return Number.isFinite(n) ? n : 0xff5050
}
