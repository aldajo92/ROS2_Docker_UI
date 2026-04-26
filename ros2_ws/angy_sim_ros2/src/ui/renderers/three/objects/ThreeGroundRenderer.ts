import * as THREE from 'three'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Inert ground + grid. Renders once on `init`; never reads
 * `SimulationState`. The grid is sized generously (40m × 40m) so we
 * can run scenarios up to ~20m from the origin without it visibly
 * ending. Scale up if scenarios start spanning further.
 */
export class ThreeGroundRenderer {
  private readonly context: ThreeSceneContext
  private group?: THREE.Group
  private showGrid: boolean

  constructor(context: ThreeSceneContext, showGrid = true) {
    this.context = context
    this.showGrid = showGrid
  }

  init(): void {
    if (this.group) return
    const group = new THREE.Group()
    group.name = 'ground'

    // Solid ground plane. We keep it just slightly below 0 so the
    // grid lines don't z-fight with the plane surface.
    const planeGeo = new THREE.PlaneGeometry(40, 40)
    const planeMat = new THREE.MeshStandardMaterial({
      color: 0x202028,
      roughness: 1,
      metalness: 0,
    })
    const plane = new THREE.Mesh(planeGeo, planeMat)
    plane.rotation.x = -Math.PI / 2 // lay it flat in the XZ plane
    plane.position.y = -0.001
    plane.name = 'ground-plane'
    group.add(plane)

    if (this.showGrid) {
      // Grid every 1m, 40 squares per side.
      const grid = new THREE.GridHelper(40, 40, 0x444466, 0x303040)
      grid.name = 'ground-grid'
      group.add(grid)
    }

    this.context.scene.add(group)
    this.group = group
  }

  dispose(): void {
    if (!this.group) return
    this.context.scene.remove(this.group)
    this.group.traverse((child) => {
      const mesh = child as THREE.Mesh
      mesh.geometry?.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat?.dispose()
    })
    this.group = undefined
  }
}
