import type Phaser from 'phaser'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { StaticObstacleEntity } from '../../../../simulation/entities/StaticObstacleEntity'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import {
  simLengthToPhaser,
  simPoint2DToPhaser,
  simYawToPhaserRotation,
} from '../mapping/simToPhaser'
import { OBSTACLE_COLOR, OBSTACLE_STROKE_COLOR } from './VisualStyle'

/**
 * 2D geometry for `StaticObstacleEntity`.
 *
 *   - circle obstacle    → filled `Arc`
 *   - rectangle obstacle → filled `Rectangle`, rotated by `shape.yaw`
 *                          (via `simYawToPhaserRotation`)
 *
 * Static obstacles never move, so we still re-sync their position on
 * every tick (cheap, and lets future scenarios swap obstacles without
 * an extra event). The renderer NEVER mutates `SimulationState`; it
 * only reads `obstacle.position` and `obstacle.shape`.
 */
export class PhaserStaticObstacleRenderer {
  private readonly context: PhaserSceneContext
  // A plain map (not `PhaserRenderObjectRegistry`) because each entry
  // tracks the obstacle's shape kind alongside the game object so we
  // can recreate it if the shape kind ever swaps.
  private readonly entries = new Map<string, ObstacleEntry>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const obstacles =
      state.entities.byType<StaticObstacleEntity>('static_obstacle')
    const liveIds = new Set<string>()

    for (const obstacle of obstacles) {
      liveIds.add(obstacle.id)
      let entry = this.entries.get(obstacle.id)
      if (!entry || entry.shapeType !== obstacle.shape.type) {
        // First sight, or obstacle shape kind changed (defensive).
        if (entry) entry.object.destroy()
        entry = this.createObstacle(obstacle)
        this.entries.set(obstacle.id, entry)
      }
      this.positionEntry(entry, obstacle)
    }

    for (const [id, entry] of [...this.entries]) {
      if (!liveIds.has(id)) {
        entry.object.destroy()
        this.entries.delete(id)
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.object.destroy()
    this.entries.clear()
  }

  private createObstacle(obstacle: StaticObstacleEntity): ObstacleEntry {
    const ppm = this.context.viewport.pixelsPerMeter

    if (obstacle.shape.type === 'circle') {
      const radiusPx = simLengthToPhaser(obstacle.shape.radius, ppm)
      const arc = this.context.scene.add.circle(0, 0, radiusPx, OBSTACLE_COLOR, 1)
      arc.setStrokeStyle(2, OBSTACLE_STROKE_COLOR, 1)
      arc.setName(`obstacle:${obstacle.id}`)
      return { shapeType: 'circle', object: arc }
    }

    const lengthPx = simLengthToPhaser(obstacle.shape.length, ppm)
    const thicknessPx = simLengthToPhaser(obstacle.shape.thickness, ppm)
    const rect = this.context.scene.add.rectangle(
      0,
      0,
      lengthPx,
      thicknessPx,
      OBSTACLE_COLOR,
      1,
    )
    rect.setStrokeStyle(2, OBSTACLE_STROKE_COLOR, 1)
    rect.setName(`obstacle:${obstacle.id}`)
    return { shapeType: 'rectangle', object: rect }
  }

  private positionEntry(
    entry: ObstacleEntry,
    obstacle: StaticObstacleEntity,
  ): void {
    const screen = simPoint2DToPhaser(obstacle.position, this.context.viewport)
    entry.object.setPosition(screen.x, screen.y)
    if (obstacle.shape.type === 'rectangle') {
      const ppm = this.context.viewport.pixelsPerMeter
      const lengthPx = simLengthToPhaser(obstacle.shape.length, ppm)
      const thicknessPx = simLengthToPhaser(obstacle.shape.thickness, ppm)
      // Rectangle's local +X is along its width axis — we set its
      // width = length so local +X coincides with the "forward" axis
      // that `simYawToPhaserRotation` expects.
      ;(entry.object as Phaser.GameObjects.Rectangle).setSize(
        lengthPx,
        thicknessPx,
      )
      entry.object.setRotation(simYawToPhaserRotation(obstacle.shape.yaw))
    } else {
      ;(entry.object as Phaser.GameObjects.Arc).setRadius(
        simLengthToPhaser(
          obstacle.shape.radius,
          this.context.viewport.pixelsPerMeter,
        ),
      )
      entry.object.setRotation(0)
    }
  }
}

interface ObstacleEntry {
  shapeType: 'circle' | 'rectangle'
  object: Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle
}
