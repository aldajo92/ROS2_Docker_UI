import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree, simYawToThreeRotationY } from '../mapping/simToThree'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'

/**
 * Box-on-wheels-shaped placeholder for `VehicleEntity`. One mesh per
 * `vehicle.id`, created lazily on first sight and removed (with full
 * GPU disposal) when the entity disappears from the scene.
 *
 * Mesh local forward is +X — matches the convention encoded in
 * `simYawToThreeRotationY`. Don't pre-rotate the geometry here or the
 * yaw mapping will silently drift.
 */
export class ThreeVehicleRenderer {
  private readonly context: ThreeSceneContext
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Mesh>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      let mesh = this.registry.get(vehicle.id)
      if (!mesh) {
        mesh = this.createVehicleMesh(vehicle)
        this.registry.set(vehicle.id, mesh)
        this.context.scene.add(mesh)
      }
      this.syncVehicleMesh(mesh, vehicle)
    }

    for (const [id, mesh] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(mesh)
        disposeObject3D(mesh)
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const mesh of this.registry.values()) {
      this.context.scene.remove(mesh)
      disposeObject3D(mesh)
    }
    this.registry.clear()
  }

  private createVehicleMesh(vehicle: VehicleEntity): THREE.Mesh {
    const radius = vehicle.radius
    // Long axis along sim +X (mesh local forward), so length > width.
    const length = radius * 4
    const width = radius * 2
    const height = radius * 1.2

    const geometry = new THREE.BoxGeometry(length, height, width)
    const material = new THREE.MeshStandardMaterial({
      color: 0x4a8df0,
      roughness: 0.5,
      metalness: 0.1,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `vehicle:${vehicle.id}`
    return mesh
  }

  private syncVehicleMesh(mesh: THREE.Mesh, vehicle: VehicleEntity): void {
    // Lift mesh so its base rests on the ground plane (y = half height).
    const halfHeight = vehicle.radius * 0.6
    mesh.position.copy(simPoint2DToThree(vehicle.pose.position, halfHeight))
    mesh.rotation.set(0, simYawToThreeRotationY(vehicle.pose.yaw), 0)
  }
}
