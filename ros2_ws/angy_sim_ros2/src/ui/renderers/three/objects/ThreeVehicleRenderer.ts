import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { setSimPose2D } from '../mapping/ThreeSimTransform'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import {
  VEHICLE_BODY_COLOR,
  VEHICLE_HEIGHT_RATIO,
  VEHICLE_LENGTH_RATIO,
  VEHICLE_WIDTH_RATIO,
} from '../config/VisualStyle'

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
    // Proportions scaled off `radius` (see VisualStyle). At angelos's
    // CAR_RADIUS=0.3 these reproduce the original 0.5 × 0.3 × 0.3 box.
    // Long axis is along sim +X (mesh local forward) so the vehicle
    // points where `simYawToThreeRotationY` says it does.
    const length = radius * VEHICLE_LENGTH_RATIO
    const width = radius * VEHICLE_WIDTH_RATIO
    const height = radius * VEHICLE_HEIGHT_RATIO

    // BoxGeometry args are (three X, three Y, three Z); sim length is
    // along three X, sim width is along three Z, height is three Y.
    const geometry = new THREE.BoxGeometry(length, height, width)
    const material = new THREE.MeshStandardMaterial({
      color: VEHICLE_BODY_COLOR,
      roughness: 0.5,
      metalness: 0.1,
    })

    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `vehicle:${vehicle.id}`
    return mesh
  }

  private syncVehicleMesh(mesh: THREE.Mesh, vehicle: VehicleEntity): void {
    // Lift the mesh so its base rests on the ground plane.
    const halfHeight = (vehicle.radius * VEHICLE_HEIGHT_RATIO) / 2
    setSimPose2D(mesh, vehicle.pose, halfHeight)
  }
}
