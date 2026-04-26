import type Phaser from 'phaser'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { simLengthToPhaser, simPoint2DToPhaser } from '../mapping/simToPhaser'
import {
  AXIS_LENGTH_M,
  AXIS_STROKE_PX,
  AXIS_TIP_PX,
  AXIS_X_COLOR,
  AXIS_Y_COLOR,
  ORIGIN_MARKER_COLOR,
  ORIGIN_MARKER_SIZE_PX,
} from './VisualStyle'

/**
 * Sim-frame axis gizmo drawn at the simulation origin. ROS / Gazebo
 * convention: X = red, Y = green. The Z axis is omitted because the
 * Phaser viewport is a top-down 2D projection — drawing it on the
 * ground plane would be misleading.
 *
 * The gizmo follows the active viewport (origin position, pixels per
 * meter), so resizing the canvas re-centers and rescales it.
 */
export class PhaserAxesRenderer {
  private readonly context: PhaserSceneContext
  private graphics?: Phaser.GameObjects.Graphics
  private originMarker?: Phaser.GameObjects.Rectangle

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  init(): void {
    this.graphics = this.context.scene.add.graphics()
    this.graphics.setName('world-axes')
    this.graphics.setDepth(-500)

    this.originMarker = this.context.scene.add.rectangle(
      0,
      0,
      ORIGIN_MARKER_SIZE_PX,
      ORIGIN_MARKER_SIZE_PX,
      ORIGIN_MARKER_COLOR,
      1,
    )
    this.originMarker.setName('origin-marker')
    this.originMarker.setDepth(-499)
    this.redraw()
  }

  /** Recompute and redraw. Call on resize or pixelsPerMeter change. */
  redraw(): void {
    const g = this.graphics
    if (!g) return
    g.clear()

    const ppm = this.context.viewport.pixelsPerMeter
    const origin = simPoint2DToPhaser(Point2D.of(0, 0), this.context.viewport)
    const lenPx = simLengthToPhaser(AXIS_LENGTH_M, ppm)

    // X axis (sim +X → screen +X) — red.
    g.lineStyle(AXIS_STROKE_PX, AXIS_X_COLOR, 1)
    g.lineBetween(origin.x, origin.y, origin.x + lenPx, origin.y)
    drawArrowTip(g, origin.x + lenPx, origin.y, 'right', AXIS_X_COLOR)

    // Y axis (sim +Y → screen -Y, the Y flip) — green.
    g.lineStyle(AXIS_STROKE_PX, AXIS_Y_COLOR, 1)
    g.lineBetween(origin.x, origin.y, origin.x, origin.y - lenPx)
    drawArrowTip(g, origin.x, origin.y - lenPx, 'up', AXIS_Y_COLOR)

    if (this.originMarker) {
      this.originMarker.setPosition(origin.x, origin.y)
    }
  }

  dispose(): void {
    this.graphics?.destroy()
    this.graphics = undefined
    this.originMarker?.destroy()
    this.originMarker = undefined
  }
}

/**
 * Draw a small filled triangular tip at `(x, y)` pointing in the given
 * screen direction. We use `fillTriangle` rather than line strokes so
 * the tip stays crisp at thin axis stroke widths.
 */
function drawArrowTip(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  direction: 'right' | 'up',
  color: number,
): void {
  g.fillStyle(color, 1)
  if (direction === 'right') {
    g.fillTriangle(
      x,
      y,
      x - AXIS_TIP_PX,
      y - AXIS_TIP_PX / 2,
      x - AXIS_TIP_PX,
      y + AXIS_TIP_PX / 2,
    )
  } else {
    g.fillTriangle(
      x,
      y,
      x - AXIS_TIP_PX / 2,
      y + AXIS_TIP_PX,
      x + AXIS_TIP_PX / 2,
      y + AXIS_TIP_PX,
    )
  }
}
