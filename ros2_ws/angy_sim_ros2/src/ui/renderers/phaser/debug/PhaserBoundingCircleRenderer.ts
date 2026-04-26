import type Phaser from 'phaser'
import type { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { StaticObstacleEntity } from '../../../../simulation/entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../../../../simulation/entities/DynamicActorEntity'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserRenderObjectRegistry } from '../core/PhaserRenderObjectRegistry'
import { simLengthToPhaser, simPoint2DToPhaser } from '../mapping/simToPhaser'
import {
  BOUNDING_CIRCLE_COLOR,
  BOUNDING_CIRCLE_OPACITY,
} from '../objects/VisualStyle'

/**
 * Stroked bounding circles for every collidable entity. Useful when
 * debugging the collision backend visually — the circle radius matches
 * the entity's `radius`, which is what `SimpleCircleCollisionBackend2D`
 * reads.
 *
 * Renders for vehicles, static obstacles, and dynamic actors. Each gets
 * its own `Phaser.GameObjects.Arc` because Phaser doesn't have a cheap
 * "stroked-only" primitive — `Arc` plus `setStrokeStyle` is the
 * canonical pattern.
 */
export class PhaserBoundingCircleRenderer {
  private readonly context: PhaserSceneContext
  private readonly registry =
    new PhaserRenderObjectRegistry<Phaser.GameObjects.Arc>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const liveIds = new Set<string>()
    const ppm = this.context.viewport.pixelsPerMeter

    for (const v of state.entities.byType<VehicleEntity>('vehicle')) {
      this.syncCircle(v.id, v.pose.position, v.radius, ppm, liveIds)
    }
    for (const o of state.entities.byType<StaticObstacleEntity>(
      'static_obstacle',
    )) {
      this.syncCircle(o.id, o.position, o.radius, ppm, liveIds)
    }
    for (const a of state.entities.byType<DynamicActorEntity>('dynamic_actor')) {
      this.syncCircle(a.id, a.pose.position, a.radius, ppm, liveIds)
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

  private syncCircle(
    id: string,
    position: Point2D,
    simRadius: number,
    ppm: number,
    liveIds: Set<string>,
  ): void {
    liveIds.add(id)
    let arc = this.registry.get(id)
    const radiusPx = simLengthToPhaser(simRadius, ppm)
    if (!arc) {
      arc = this.context.scene.add.circle(0, 0, radiusPx, 0x000000, 0)
      arc.setStrokeStyle(2, BOUNDING_CIRCLE_COLOR, BOUNDING_CIRCLE_OPACITY)
      arc.setName(`bounding:${id}`)
      this.registry.set(id, arc)
    }
    const screen = simPoint2DToPhaser(position, this.context.viewport)
    arc.setPosition(screen.x, screen.y)
    arc.setRadius(radiusPx)
  }
}
