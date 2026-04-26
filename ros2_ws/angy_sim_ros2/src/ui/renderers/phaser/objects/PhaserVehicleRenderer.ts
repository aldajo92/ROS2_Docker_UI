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
  VEHICLE_BODY_COLOR,
  VEHICLE_LENGTH_RATIO,
  VEHICLE_WIDTH_RATIO,
} from './VisualStyle'

/**
 * Top-down rectangle for `VehicleEntity`. Body local +X is the forward
 * direction (matches the convention encoded in `simYawToPhaserRotation`),
 * so we draw the rectangle centered on the origin and let the container's
 * rotation alone orient it.
 *
 * One container per vehicle.id, created lazily on first sight, removed
 * (with full destroy) when the entity disappears.
 *
 * The renderer NEVER mutates `SimulationState`. It only reads
 * `vehicle.pose` and `vehicle.radius`.
 */
export class PhaserVehicleRenderer {
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
      let container = this.registry.get(vehicle.id)
      if (!container) {
        container = this.createVehicleContainer(vehicle)
        this.registry.set(vehicle.id, container)
      }
      this.syncVehicleContainer(container, vehicle)
    }

    for (const [id, container] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        container.destroy()
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const container of this.registry.values()) container.destroy()
    this.registry.clear()
  }

  private createVehicleContainer(
    vehicle: VehicleEntity,
  ): Phaser.GameObjects.Container {
    const ppm = this.context.viewport.pixelsPerMeter
    const length = simLengthToPhaser(vehicle.radius * VEHICLE_LENGTH_RATIO, ppm)
    const width = simLengthToPhaser(vehicle.radius * VEHICLE_WIDTH_RATIO, ppm)

    const body = this.context.scene.add.rectangle(
      0,
      0,
      length,
      width,
      VEHICLE_BODY_COLOR,
      1,
    )
    // Stroke so the body silhouette stays visible against same-color
    // backgrounds; cheap to render.
    body.setStrokeStyle(1, 0x0b1220, 0.75)

    // Heading is conveyed by the debug heading-arrow layer; we keep
    // the body rectangle clean here.
    const container = this.context.scene.add.container(0, 0, [body])
    container.setName(`vehicle:${vehicle.id}`)
    return container
  }

  private syncVehicleContainer(
    container: Phaser.GameObjects.Container,
    vehicle: VehicleEntity,
  ): void {
    const screen = simPoint2DToPhaser(vehicle.pose.position, this.context.viewport)
    container.setPosition(screen.x, screen.y)
    container.setRotation(simYawToPhaserRotation(vehicle.pose.yaw))
  }
}
