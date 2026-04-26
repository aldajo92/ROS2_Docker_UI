import type Phaser from 'phaser'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserRenderObjectRegistry } from '../core/PhaserRenderObjectRegistry'
import {
  simLengthToPhaser,
  simPoint2DToPhaser,
  simYawToPhaserRotation,
} from '../mapping/simToPhaser'
import {
  ARROW_LENGTH_RATIO,
  ARROW_TIP_RATIO,
  HEADING_ARROW_COLOR,
  VEHICLE_LENGTH_RATIO,
} from '../objects/VisualStyle'

/**
 * Heading arrow drawn out of the vehicle's front bumper. Uses the same
 * proportions as the Three.js heading arrow so the two renderers read
 * identically. The arrow geometry is built in vehicle-local
 * coordinates (forward = +X) inside a `Container` whose rotation is
 * driven by `simYawToPhaserRotation` — keeping yaw conversion in
 * exactly one place.
 */
export class PhaserHeadingArrowRenderer {
  private readonly context: PhaserSceneContext
  private readonly registry =
    new PhaserRenderObjectRegistry<Phaser.GameObjects.Container>()

  constructor(context: PhaserSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      let group = this.registry.get(vehicle.id)
      if (!group) {
        group = this.createArrow(vehicle)
        this.registry.set(vehicle.id, group)
      }
      const screen = simPoint2DToPhaser(
        vehicle.pose.position,
        this.context.viewport,
      )
      group.setPosition(screen.x, screen.y)
      group.setRotation(simYawToPhaserRotation(vehicle.pose.yaw))
    }

    for (const [id, group] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        group.destroy()
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const group of this.registry.values()) group.destroy()
    this.registry.clear()
  }

  private createArrow(vehicle: VehicleEntity): Phaser.GameObjects.Container {
    const ppm = this.context.viewport.pixelsPerMeter
    const halfBodyLength = simLengthToPhaser(
      (vehicle.radius * VEHICLE_LENGTH_RATIO) / 2,
      ppm,
    )
    const arrowLen = simLengthToPhaser(vehicle.radius * ARROW_LENGTH_RATIO, ppm)
    const tipHalf = simLengthToPhaser(vehicle.radius * ARROW_TIP_RATIO, ppm)
    const tipLen = tipHalf * 1.5
    const shaftStart = halfBodyLength
    const shaftEnd = halfBodyLength + arrowLen - tipLen
    const shaftThickness = Math.max(2, ppm * 0.04)

    // Single Graphics object draws shaft + tip in honest local
    // coordinates. Using `add.rectangle(...)` / `add.triangle(...)`
    // would let Phaser auto-recenter each shape on its bbox, which
    // breaks the "container local +X is forward" invariant.
    const arrow = this.context.scene.add.graphics()
    arrow.fillStyle(HEADING_ARROW_COLOR, 1)
    arrow.fillRect(
      shaftStart,
      -shaftThickness / 2,
      shaftEnd - shaftStart,
      shaftThickness,
    )
    arrow.beginPath()
    arrow.moveTo(shaftEnd + tipLen, 0)
    arrow.lineTo(shaftEnd, -tipHalf)
    arrow.lineTo(shaftEnd, tipHalf)
    arrow.closePath()
    arrow.fillPath()

    const container = this.context.scene.add.container(0, 0, [arrow])
    container.setName(`heading:${vehicle.id}`)
    container.setDepth(10)
    return container
  }
}
