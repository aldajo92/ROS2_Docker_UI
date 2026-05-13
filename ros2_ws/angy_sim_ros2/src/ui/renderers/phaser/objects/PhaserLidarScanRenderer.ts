import type Phaser from 'phaser'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { LidarScan2D } from '../../../../simulation/sensors/LidarScan2D'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { simPoint2DToPhaser } from '../mapping/simToPhaser'

/** Visual style — faint blue rays, brighter cyan hit dots. */
const RAY_COLOR = 0x2a7bff
const HIT_COLOR = 0x00ffff
const RAY_ALPHA = 0.3
const HIT_ALPHA = 0.9
const HIT_RADIUS_PX = 2

/**
 * Renders the latest lidar scan per sensor from `state.lidarScans`.
 *
 * One Phaser `Graphics` object per scan id. Redrawn from scratch each
 * sync (cheap for typical ray counts of ~180–720 and avoids stale
 * geometry). Graphics objects are destroyed when a scan disappears.
 *
 * Reads from `state.lidarScans.toArray()` — never mutates state.
 */
export class PhaserLidarScanRenderer {
  private readonly context: PhaserSceneContext
  private readonly graphics = new Map<string, Phaser.GameObjects.Graphics>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const scans = state.lidarScans.toArray()
    const activeIds = new Set(scans.map((s) => s.id))

    for (const id of [...this.graphics.keys()]) {
      if (!activeIds.has(id)) this.removeGraphics(id)
    }

    for (const scan of scans) {
      let g = this.graphics.get(scan.id)
      if (!g) {
        g = this.context.scene.add.graphics()
        g.setName(`lidar:${scan.id}`)
        this.graphics.set(scan.id, g)
      }
      this.drawScan(g, scan)
    }
  }

  dispose(): void {
    for (const id of [...this.graphics.keys()]) this.removeGraphics(id)
  }

  // ---------------------------------------------------------------------------

  private drawScan(
    g: Phaser.GameObjects.Graphics,
    scan: LidarScan2D,
  ): void {
    g.clear()

    const rayCount = scan.ranges.length
    if (rayCount === 0) return

    const vp = this.context.viewport

    // World-space sensor origin and orientation stored in the scan.
    // Fall back to (0,0,0) for replay files written before these fields exist.
    const ox = scan.originX ?? 0
    const oy = scan.originY ?? 0
    const worldYaw = scan.worldYaw ?? 0
    const origin = simPoint2DToPhaser(Point2D.of(ox, oy), vp)

    // Ray lines (faint)
    g.lineStyle(1, RAY_COLOR, RAY_ALPHA)

    for (let i = 0; i < rayCount; i++) {
      // World-space ray angle: sensor world yaw + local scan angle.
      const angle = worldYaw + scan.angleMin + i * scan.angleIncrement
      const r = scan.ranges[i]
      const ex = ox + Math.cos(angle) * r
      const ey = oy + Math.sin(angle) * r
      const ep = simPoint2DToPhaser(Point2D.of(ex, ey), vp)

      g.beginPath()
      g.moveTo(origin.x, origin.y)
      g.lineTo(ep.x, ep.y)
      g.strokePath()
    }

    // Hit point dots (brighter)
    g.fillStyle(HIT_COLOR, HIT_ALPHA)
    for (let i = 0; i < rayCount; i++) {
      const r = scan.ranges[i]
      if (r >= scan.rangeMax * 0.999) continue // no hit
      const angle = worldYaw + scan.angleMin + i * scan.angleIncrement
      const hx = ox + Math.cos(angle) * r
      const hy = oy + Math.sin(angle) * r
      const hp = simPoint2DToPhaser(Point2D.of(hx, hy), vp)
      g.fillCircle(hp.x, hp.y, HIT_RADIUS_PX)
    }
  }

  private removeGraphics(id: string): void {
    const g = this.graphics.get(id)
    if (!g) return
    g.destroy()
    this.graphics.delete(id)
  }
}
