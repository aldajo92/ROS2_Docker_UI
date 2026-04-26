import type Phaser from 'phaser'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { simPoint2DToPhaser } from '../mapping/simToPhaser'
import { PATH_COLOR, PATH_STROKE_PX } from './VisualStyle'

/**
 * Polylines for `state.paths` (planned / reference paths). One Phaser
 * `Graphics` object per path id, redrawn from scratch on every sync —
 * the path point count is small enough that the cost is negligible
 * compared to vehicle integration, and a fresh polyline avoids any
 * subtle "stale geometry" bugs when scenarios swap path content.
 */
export class PhaserPathRenderer {
  private readonly context: PhaserSceneContext
  private readonly graphics = new Map<string, Phaser.GameObjects.Graphics>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const paths = state.paths.toArray()
    const activeIds = new Set(paths.map((p) => p.id))

    for (const id of [...this.graphics.keys()]) {
      if (!activeIds.has(id)) this.removeGraphics(id)
    }

    for (const path of paths) {
      let g = this.graphics.get(path.id)
      if (!g) {
        g = this.context.scene.add.graphics()
        g.setName(`path:${path.id}`)
        this.graphics.set(path.id, g)
      }

      g.clear()
      if (path.points.length < 2) continue

      g.lineStyle(PATH_STROKE_PX, PATH_COLOR, 1)
      const start = simPoint2DToPhaser(
        Point2D.of(path.points[0].x, path.points[0].y),
        this.context.viewport,
      )
      g.beginPath()
      g.moveTo(start.x, start.y)
      for (let i = 1; i < path.points.length; i++) {
        const p = simPoint2DToPhaser(
          Point2D.of(path.points[i].x, path.points[i].y),
          this.context.viewport,
        )
        g.lineTo(p.x, p.y)
      }
      g.strokePath()
    }
  }

  dispose(): void {
    for (const id of [...this.graphics.keys()]) this.removeGraphics(id)
  }

  private removeGraphics(id: string): void {
    const g = this.graphics.get(id)
    if (!g) return
    g.destroy()
    this.graphics.delete(id)
  }
}
