import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { setSimPose2D } from '../mapping/ThreeSimTransform'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { createArrow } from '../objects/createArrow'
import {
  ARROW_LENGTH_RATIO,
  ARROW_SHAFT_RADIUS_RATIO,
  ARROW_TIP_LENGTH_RATIO,
  ARROW_TIP_RADIUS_RATIO,
  HEADING_ARROW_COLOR,
  VEHICLE_HEIGHT_RATIO,
  VEHICLE_LENGTH_RATIO,
} from '../config/VisualStyle'

/**
 * Heading arrow that visually matches angelos's car: starts at the
 * vehicle's front bumper and extends `ARROW_LENGTH_RATIO × radius`
 * along the vehicle's local +X. Yaw is applied via the parent
 * group's `rotation.y` (driven through `simYawToThreeRotationY`) so
 * the child geometry stays a plain "arrow on +X" — keeping yaw
 * conversion in exactly one place.
 *
 * The shaft + cone construction is shared with `ThreeAxesRenderer`
 * via `createArrow`; only colors and proportions differ.
 */
export class HeadingArrowRenderer {
  private readonly context: ThreeSceneContext
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Group>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      let group = this.registry.get(vehicle.id)
      if (!group) {
        group = createHeadingArrowFor(vehicle.radius)
        this.registry.set(vehicle.id, group)
        this.context.scene.add(group)
      }
      // Lift to the vehicle's mid-body height so the arrow emerges
      // horizontally from the front face — angelos achieved this by
      // making `<Arrow>` a child of the car group whose centroid
      // already sits at `halfHeight`. We replicate that vertical
      // anchor here without parenting the renderers.
      const halfHeight = (vehicle.radius * VEHICLE_HEIGHT_RATIO) / 2
      setSimPose2D(group, vehicle.pose, halfHeight)
    }

    for (const [id, group] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(group)
        disposeObject3D(group)
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const group of this.registry.values()) {
      this.context.scene.remove(group)
      disposeObject3D(group)
    }
    this.registry.clear()
  }
}

function createHeadingArrowFor(radius: number): THREE.Group {
  // Front-bumper offset: half the box length, so the arrow visually
  // emerges from the front of the vehicle just like in angelos.
  const halfBodyLength = (radius * VEHICLE_LENGTH_RATIO) / 2

  const group = createArrow({
    length: radius * ARROW_LENGTH_RATIO,
    shaftRadius: radius * ARROW_SHAFT_RADIUS_RATIO,
    tipRadius: radius * ARROW_TIP_RADIUS_RATIO,
    tipLength: radius * ARROW_TIP_LENGTH_RATIO,
    color: HEADING_ARROW_COLOR,
    shaftStartX: halfBodyLength,
  })
  group.name = 'heading-arrow'
  return group
}
