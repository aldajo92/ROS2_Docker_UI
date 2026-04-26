import type Phaser from 'phaser'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { DynamicActorEntity } from '../../../../simulation/entities/DynamicActorEntity'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserRenderObjectRegistry } from '../core/PhaserRenderObjectRegistry'
import {
  simLengthToPhaser,
  simPoint2DToPhaser,
  simYawToPhaserRotation,
} from '../mapping/simToPhaser'
import { ACTOR_COLOR } from './VisualStyle'

/**
 * Filled circle for `DynamicActorEntity` (pedestrians / scripted
 * traffic). We still apply rotation even though a circle is rotation-
 * invariant, so future actor visuals (capsules, capsule-with-arrow)
 * inherit the right orientation without code changes here.
 */
export class PhaserDynamicActorRenderer {
  private readonly context: PhaserSceneContext
  private readonly registry =
    new PhaserRenderObjectRegistry<Phaser.GameObjects.Arc>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const actors = state.entities.byType<DynamicActorEntity>('dynamic_actor')
    const liveIds = new Set<string>()

    for (const actor of actors) {
      liveIds.add(actor.id)
      let arc = this.registry.get(actor.id)
      if (!arc) {
        arc = this.createActor(actor)
        this.registry.set(actor.id, arc)
      }
      const screen = simPoint2DToPhaser(actor.pose.position, this.context.viewport)
      arc.setPosition(screen.x, screen.y)
      arc.setRotation(simYawToPhaserRotation(actor.pose.yaw))
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

  private createActor(actor: DynamicActorEntity): Phaser.GameObjects.Arc {
    const radiusPx = simLengthToPhaser(
      actor.radius,
      this.context.viewport.pixelsPerMeter,
    )
    const arc = this.context.scene.add.circle(0, 0, radiusPx, ACTOR_COLOR, 1)
    arc.setName(`actor:${actor.id}`)
    return arc
  }
}
