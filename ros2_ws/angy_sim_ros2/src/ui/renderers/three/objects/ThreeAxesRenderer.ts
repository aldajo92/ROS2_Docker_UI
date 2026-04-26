import * as THREE from 'three'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * World-axis gizmo, positioned at the simulation origin. Three.js's
 * built-in `AxesHelper` already uses the right colors (R=X, G=Y, B=Z),
 * but its axes are in the THREE frame, not the simulation frame — and
 * for the user, the meaningful frame is the simulation one.
 *
 * Mapping:
 *   - sim +X → three +X (helper red, no remap needed)
 *   - sim +Y → three +Z (we relabel mentally, geometry unchanged)
 *   - sim +Z → three +Y (same)
 *
 * The geometry itself doesn't care; we just lift the helper a hair
 * off the ground so it doesn't z-fight the grid.
 */
export class ThreeAxesRenderer {
  private readonly context: ThreeSceneContext
  private helper?: THREE.AxesHelper

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  init(): void {
    if (this.helper) return
    this.helper = new THREE.AxesHelper(1.5)
    this.helper.position.y = 0.01
    this.helper.name = 'world-axes'
    this.context.scene.add(this.helper)
  }

  dispose(): void {
    if (!this.helper) return
    this.context.scene.remove(this.helper)
    this.helper.geometry.dispose()
    if (Array.isArray(this.helper.material)) {
      this.helper.material.forEach((m) => m.dispose())
    } else {
      this.helper.material.dispose()
    }
    this.helper = undefined
  }
}
