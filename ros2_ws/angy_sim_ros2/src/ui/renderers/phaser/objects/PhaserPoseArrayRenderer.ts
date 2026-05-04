import type Phaser from 'phaser'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { PoseArray2D } from '../../../../simulation/poses/PoseArray2D'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { simPoint2DToPhaser } from '../mapping/simToPhaser'

const DEFAULT_COLOR = 0x00bcd4
const DEFAULT_ARROW_PX = 30
const DEFAULT_STROKE_PX = 2

/**
 * Draws `state.poseArrays` as 2-D arrows on the Phaser canvas.
 * One `Phaser.GameObjects.Graphics` object per PoseArray2D id; redrawn
 * from scratch every sync (same pattern as PhaserPathRenderer).
 */
export class PhaserPoseArrayRenderer {
  private readonly context: PhaserSceneContext
  private readonly graphics = new Map<string, Phaser.GameObjects.Graphics>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const poseArrays = state.poseArrays.toArray()
    const activeIds = new Set(poseArrays.map((pa) => pa.id))

    for (const id of [...this.graphics.keys()]) {
      if (!activeIds.has(id)) this.removeGraphics(id)
    }

    for (const poseArray of poseArrays) {
      let g = this.graphics.get(poseArray.id)
      if (!g) {
        g = this.context.scene.add.graphics()
        g.setName(`poseArray:${poseArray.id}`)
        this.graphics.set(poseArray.id, g)
      }
      g.clear()
      this.drawPoseArray(g, poseArray)
    }
  }

  dispose(): void {
    for (const id of [...this.graphics.keys()]) this.removeGraphics(id)
  }

  private drawPoseArray(
    g: Phaser.GameObjects.Graphics,
    poseArray: PoseArray2D,
  ): void {
    const { viewport } = this.context

    const strokeColor = poseArray.color
      ? parseInt(poseArray.color.replace('#', ''), 16)
      : DEFAULT_COLOR
    const strokeWidth = poseArray.thickness ?? DEFAULT_STROKE_PX
    const arrowPx = poseArray.arrowSize != null
      ? poseArray.arrowSize * viewport.pixelsPerMeter
      : DEFAULT_ARROW_PX

    const tipLen = arrowPx * 0.3
    const tipHalfWidth = arrowPx * 0.12

    g.lineStyle(strokeWidth, strokeColor, 1)
    g.fillStyle(strokeColor, 1)

    for (const pose of poseArray.poses) {
      const origin = simPoint2DToPhaser(Point2D.of(pose.x, pose.y), viewport)

      // In Phaser coords: +X is right, +Y is down. Sim yaw is CCW from +X.
      // Phaser screen angle: cos(yaw) right, -sin(yaw) down.
      const dx = Math.cos(pose.yaw)
      const dy = -Math.sin(pose.yaw)

      const tipX = origin.x + dx * arrowPx
      const tipY = origin.y + dy * arrowPx

      // Shaft
      g.beginPath()
      g.moveTo(origin.x, origin.y)
      g.lineTo(tipX - dx * tipLen, tipY - dy * tipLen)
      g.strokePath()

      // Arrowhead (filled triangle)
      const perpX = -dy
      const perpY = dx
      g.fillTriangle(
        tipX,
        tipY,
        tipX - dx * tipLen + perpX * tipHalfWidth,
        tipY - dy * tipLen + perpY * tipHalfWidth,
        tipX - dx * tipLen - perpX * tipHalfWidth,
        tipY - dy * tipLen - perpY * tipHalfWidth,
      )
    }
  }

  private removeGraphics(id: string): void {
    const g = this.graphics.get(id)
    if (!g) return
    g.destroy()
    this.graphics.delete(id)
  }
}
