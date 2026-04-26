import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree, simYawToThreeRotationY } from '../mapping/simToThree'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'

/**
 * Short arrow pointing along each vehicle's local +X (forward). We
 * use a child mesh inside a parent group so the parent's
 * `rotation.y` (driven through `simYawToThreeRotationY`) handles
 * yaw, and the child's geometry stays a plain arrow on +X. Keeping
 * yaw conversion in one place is the whole point of this layer.
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
        group = createHeadingArrow(vehicle.radius)
        this.registry.set(vehicle.id, group)
        this.context.scene.add(group)
      }
      group.position.copy(simPoint2DToThree(vehicle.pose.position, 0.04))
      group.rotation.set(0, simYawToThreeRotationY(vehicle.pose.yaw), 0)
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

function createHeadingArrow(radius: number): THREE.Group {
  const length = radius * 3
  const headLen = radius * 0.6
  const headRadius = radius * 0.35

  const group = new THREE.Group()
  group.name = 'heading-arrow'

  const shaftGeo = new THREE.CylinderGeometry(radius * 0.08, radius * 0.08, length, 12)
  // The cylinder is built along +Y by default; rotate it to lie along +X.
  shaftGeo.rotateZ(-Math.PI / 2)
  shaftGeo.translate(length / 2, 0, 0)
  const shaftMat = new THREE.MeshBasicMaterial({ color: 0xff7f50 })
  group.add(new THREE.Mesh(shaftGeo, shaftMat))

  const headGeo = new THREE.ConeGeometry(headRadius, headLen, 16)
  headGeo.rotateZ(-Math.PI / 2)
  headGeo.translate(length + headLen / 2, 0, 0)
  const headMat = new THREE.MeshBasicMaterial({ color: 0xff5024 })
  group.add(new THREE.Mesh(headGeo, headMat))

  return group
}
