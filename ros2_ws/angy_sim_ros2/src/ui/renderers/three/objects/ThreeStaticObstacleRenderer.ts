import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree, simYawToThreeRotationY } from '../mapping/simToThree'
import { StaticObstacleEntity } from '../../../../simulation/entities/StaticObstacleEntity'
import { OBSTACLE_COLOR, OBSTACLE_HEIGHT_RATIO } from '../config/VisualStyle'

/**
 * 3D geometry for `StaticObstacleEntity`.
 *
 *   - circle obstacle    → `THREE.CylinderGeometry` (vertical pillar)
 *   - rectangle obstacle → `THREE.BoxGeometry` oriented by `shape.yaw`
 *
 * Static obstacles never move, so we still re-sync their position on
 * every tick (cheap, and lets future scenarios swap in new obstacles
 * without an extra event). Meshes are keyed by `entity.id` and
 * recreated if an obstacle disappears from the state and comes back.
 *
 * The renderer NEVER mutates `SimulationState`. It only reads
 * `obstacle.position` and `obstacle.shape`.
 */
export class ThreeStaticObstacleRenderer {
  private readonly context: ThreeSceneContext
  // A plain map (not `ThreeRenderObjectRegistry`) because each entry
  // tracks the obstacle's shape kind and a cached height alongside the
  // mesh.
  private readonly entries = new Map<string, ObstacleMeshEntry>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const obstacles = state.entities.byType<StaticObstacleEntity>('static_obstacle')
    const liveIds = new Set<string>()

    for (const obstacle of obstacles) {
      liveIds.add(obstacle.id)
      let entry = this.entries.get(obstacle.id)
      if (!entry || entry.shapeType !== obstacle.shape.type) {
        // Either first sight or the obstacle's shape kind changed
        // (shape type changes should not happen during a sim, but we
        // handle the case defensively so hot-reload / scenario swap
        // works cleanly).
        if (entry) {
          this.context.scene.remove(entry.mesh)
          disposeObject3D(entry.mesh)
        }
        entry = this.createObstacleEntry(obstacle)
        this.entries.set(obstacle.id, entry)
        this.context.scene.add(entry.mesh)
      }
      this.positionEntry(entry, obstacle)
    }

    for (const [id, entry] of [...this.entries]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(entry.mesh)
        disposeObject3D(entry.mesh)
        this.entries.delete(id)
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.context.scene.remove(entry.mesh)
      disposeObject3D(entry.mesh)
    }
    this.entries.clear()
  }

  private createObstacleEntry(obstacle: StaticObstacleEntity): ObstacleMeshEntry {
    const material = new THREE.MeshStandardMaterial({
      color: OBSTACLE_COLOR,
      roughness: 0.8,
      metalness: 0,
    })

    if (obstacle.shape.type === 'circle') {
      const radius = obstacle.shape.radius
      const height = radius * OBSTACLE_HEIGHT_RATIO
      const geometry = new THREE.CylinderGeometry(radius, radius, height, 24)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `obstacle:${obstacle.id}`
      return { shapeType: 'circle', height, mesh }
    }

    // Rectangle: length along local +X, thickness along local +Y.
    // BoxGeometry takes (sizeX, sizeY, sizeZ). With the sim→three
    // mapping used here (sim X → three X, sim Y → three -Z, sim Z →
    // three Y), we place length on three X, thickness on three Z, and
    // height on three Y. Heading rotation around three +Y matches
    // `simYawToThreeRotationY(yaw)`.
    const { length, thickness } = obstacle.shape
    // Use the smaller of length/thickness as the "radius equivalent"
    // for the height so walls stay visually proportional to the
    // existing pillar look.
    const equivRadius = Math.min(length, thickness) / 2
    const height = equivRadius * OBSTACLE_HEIGHT_RATIO
    const geometry = new THREE.BoxGeometry(length, height, thickness)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = `obstacle:${obstacle.id}`
    return { shapeType: 'rectangle', height, mesh }
  }

  private positionEntry(
    entry: ObstacleMeshEntry,
    obstacle: StaticObstacleEntity,
  ): void {
    // Lift the mesh so its base sits on the ground plane.
    const halfHeight = entry.height / 2
    entry.mesh.position.copy(simPoint2DToThree(obstacle.position, halfHeight))
    if (obstacle.shape.type === 'rectangle') {
      entry.mesh.rotation.y = simYawToThreeRotationY(obstacle.shape.yaw)
    } else {
      entry.mesh.rotation.y = 0
    }
  }
}

interface ObstacleMeshEntry {
  shapeType: 'circle' | 'rectangle'
  /** World-space vertical extent used to lift the mesh off the ground. */
  height: number
  mesh: THREE.Mesh
}
