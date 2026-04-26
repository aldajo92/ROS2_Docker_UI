import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree } from '../mapping/simToThree'
import { StaticObstacleEntity } from '../../../../simulation/entities/StaticObstacleEntity'

/**
 * Cylinders for `StaticObstacleEntity`. Static obstacles never move,
 * so we still re-sync their position on every tick (cheap, and lets
 * future scenarios swap in new obstacles without an extra event).
 */
export class ThreeStaticObstacleRenderer {
  private readonly context: ThreeSceneContext
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Mesh>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const obstacles = state.entities.byType<StaticObstacleEntity>('static_obstacle')
    const liveIds = new Set<string>()

    for (const obstacle of obstacles) {
      liveIds.add(obstacle.id)
      let mesh = this.registry.get(obstacle.id)
      if (!mesh) {
        mesh = this.createObstacleMesh(obstacle)
        this.registry.set(obstacle.id, mesh)
        this.context.scene.add(mesh)
      }
      mesh.position.copy(simPoint2DToThree(obstacle.position, obstacle.radius * 0.5))
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

  private createObstacleMesh(obstacle: StaticObstacleEntity): THREE.Mesh {
    const radius = obstacle.radius
    const height = radius
    // Cylinder, vertical axis aligned with three +Y (i.e. sim +Z up).
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 24)
    const material = new THREE.MeshStandardMaterial({
      color: 0xc25b3f,
      roughness: 0.8,
      metalness: 0,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `obstacle:${obstacle.id}`
    return mesh
  }
}
