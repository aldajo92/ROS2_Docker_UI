import type Phaser from 'phaser'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import {
  GRID_COLOR_MAJOR,
  GRID_COLOR_MINOR,
  GRID_STROKE_PX,
} from './VisualStyle'

/**
 * Metric grid drawn behind everything else. One Phaser `Graphics`
 * object that gets re-issued on every `redraw()` (called from the
 * top-level renderer on init and on resize / viewport change).
 *
 * Lines are at integer simulation meters; every 5th line is drawn
 * heavier as a major gridline. The grid extent always covers the
 * full canvas, recomputed from `context.viewport`.
 */
export class PhaserGroundRenderer {
  private readonly context: PhaserSceneContext
  private graphics?: Phaser.GameObjects.Graphics

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  init(): void {
    this.graphics = this.context.scene.add.graphics()
    this.graphics.setName('ground-grid')
    // Push the grid to the very back of the display list so vehicles,
    // obstacles, axes etc. always paint on top.
    this.graphics.setDepth(-1000)
    this.redraw()
  }

  /** Recompute and redraw the grid. Call on resize, pixelsPerMeter
   *  change, or camera pan/zoom. Cheap: a few dozen `lineBetween` calls.
   *
   *  We size the lines to the camera's *visible world rect* — not the
   *  canvas — so that pan/zoom always fills the viewport with grid.
   *  At zoom < 1 this means more lines (the visible world is bigger
   *  than the canvas); at zoom > 1, fewer. */
  redraw(): void {
    const g = this.graphics
    if (!g) return
    g.clear()

    const ppm = this.context.viewport.pixelsPerMeter
    const ox = this.context.viewport.originX
    const oy = this.context.viewport.originY
    const view = this.context.scene.cameras.main.worldView
    const left = view.x
    const right = view.x + view.width
    const top = view.y
    const bottom = view.y + view.height

    // Convert world-space view bounds to integer sim-meter ranges.
    const minSimX = Math.floor((left - ox) / ppm) - 1
    const maxSimX = Math.ceil((right - ox) / ppm) + 1
    const minSimY = Math.floor((oy - bottom) / ppm) - 1
    const maxSimY = Math.ceil((oy - top) / ppm) + 1

    for (let x = minSimX; x <= maxSimX; x++) {
      const px = ox + x * ppm
      const major = x % 5 === 0
      g.lineStyle(GRID_STROKE_PX, major ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR, 1)
      g.lineBetween(px, top, px, bottom)
    }
    for (let y = minSimY; y <= maxSimY; y++) {
      const py = oy - y * ppm
      const major = y % 5 === 0
      g.lineStyle(GRID_STROKE_PX, major ? GRID_COLOR_MAJOR : GRID_COLOR_MINOR, 1)
      g.lineBetween(left, py, right, py)
    }
  }

  dispose(): void {
    this.graphics?.destroy()
    this.graphics = undefined
  }
}
