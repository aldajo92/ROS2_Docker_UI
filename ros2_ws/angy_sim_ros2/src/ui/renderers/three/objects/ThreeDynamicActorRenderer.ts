import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree, simYawToThreeRotationY } from '../mapping/simToThree'
import { DynamicActorEntity } from '../../../../simulation/entities/DynamicActorEntity'

/**
 * Spheres for `DynamicActorEntity` (pedestrians / scripted traffic).
 * We still apply yaw even though a sphere is rotation-invariant, so
 * future actor meshes (capsules, capsule-with-arrow) inherit the
 * right orientation without code changes here.
 */
export class ThreeDynamicActorRenderer {
  private readonly context: ThreeSceneContext
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Mesh>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const actors = state.entities.byType<DynamicActorEntity>('dynamic_actor')
    const liveIds = new Set<string>()

    for (const actor of actors) {
      liveIds.add(actor.id)
      let mesh = this.registry.get(actor.id)
      if (!mesh) {
        mesh = this.createActorMesh(actor)
        this.registry.set(actor.id, mesh)
        this.context.scene.add(mesh)
      }
      mesh.position.copy(simPoint2DToThree(actor.pose.position, actor.radius))
      mesh.rotation.set(0, simYawToThreeRotationY(actor.pose.yaw), 0)
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

  private createActorMesh(actor: DynamicActorEntity): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(actor.radius, 16, 12)
    const material = new THREE.MeshStandardMaterial({
      color: 0x6ee06e,
      roughness: 0.6,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `actor:${actor.id}`
    return mesh
  }
}
