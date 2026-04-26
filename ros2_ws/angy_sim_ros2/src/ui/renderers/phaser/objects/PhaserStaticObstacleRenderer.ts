import type Phaser from 'phaser'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { StaticObstacleEntity } from '../../../../simulation/entities/StaticObstacleEntity'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserRenderObjectRegistry } from '../core/PhaserRenderObjectRegistry'
import { simLengthToPhaser, simPoint2DToPhaser } from '../mapping/simToPhaser'
import { OBSTACLE_COLOR, OBSTACLE_STROKE_COLOR } from './VisualStyle'

/**
 * Filled circle for `StaticObstacleEntity`. Static obstacles never move,
 * so we still re-sync their position on every tick (cheap, and lets
 * future scenarios swap obstacles without an extra event).
 */
export class PhaserStaticObstacleRenderer {
  private readonly context: PhaserSceneContext
  private readonly registry =
    new PhaserRenderObjectRegistry<Phaser.GameObjects.Arc>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const obstacles =
      state.entities.byType<StaticObstacleEntity>('static_obstacle')
    const liveIds = new Set<string>()

    for (const obstacle of obstacles) {
      liveIds.add(obstacle.id)
      let arc = this.registry.get(obstacle.id)
      if (!arc) {
        arc = this.createObstacle(obstacle)
        this.registry.set(obstacle.id, arc)
      }
      const screen = simPoint2DToPhaser(obstacle.position, this.context.viewport)
      arc.setPosition(screen.x, screen.y)
      // Re-sync radius too — cheap, and keeps the visual honest if a
      // future scenario reassigns radius via entity recreation.
      arc.setRadius(
        simLengthToPhaser(obstacle.radius, this.context.viewport.pixelsPerMeter),
      )
    }

    for (const [id, arc] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        arc.destroy()
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const arc of this.registry.values()) arc.destroy()
    this.registry.clear()
  }

  private createObstacle(
    obstacle: StaticObstacleEntity,
  ): Phaser.GameObjects.Arc {
    const radiusPx = simLengthToPhaser(
      obstacle.radius,
      this.context.viewport.pixelsPerMeter,
    )
    const arc = this.context.scene.add.circle(0, 0, radiusPx, OBSTACLE_COLOR, 1)
    arc.setStrokeStyle(2, OBSTACLE_STROKE_COLOR, 1)
    arc.setName(`obstacle:${obstacle.id}`)
    return arc
  }
}
