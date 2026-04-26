import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import type { Point2D } from '../../../../math/geometry/Point2D'
import { simPoint2DToThree } from '../mapping/simToThree'

/**
 * Placeholder for displaying externally-computed paths (e.g. from a
 * Python planner over the upcoming communication layer). The renderer
 * itself contains zero planning logic — it just owns one `THREE.Line`
 * per logical path id and exposes `setPath(id, points)` so a future
 * `PathTopicBridge` can drop new paths in.
 *
 * `sync(state)` is intentionally a no-op for now: paths are pushed in
 * via `setPath`, not pulled from `SimulationState`. We keep the
 * `sync` signature so this renderer slots into the same lifecycle
 * pattern as the others, and a future `PathEntity` (if we ever add
 * one) only needs to flip a single line of code.
 */
export class ThreePathRenderer {
  private readonly context: ThreeSceneContext
  private readonly lines = new Map<string, THREE.Line>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(_state: SimulationState): void {
    // Intentionally empty — paths come in via `setPath`.
  }

  /**
   * Replace (or create) the path under `id` with the given polyline
   * of simulation 2D points. Pass `[]` to clear a path without
   * removing the underlying GPU resources.
   */
  setPath(id: string, points: readonly Point2D[]): void {
    let line = this.lines.get(id)
    if (!line) {
      const geometry = new THREE.BufferGeometry()
      const material = new THREE.LineBasicMaterial({ color: 0xf0c14a })
      line = new THREE.Line(geometry, material)
      line.frustumCulled = false
      line.name = `path:${id}`
      this.lines.set(id, line)
      this.context.scene.add(line)
    }
    const projected = points.map((p) => simPoint2DToThree(p, 0.06))
    ;(line.geometry as THREE.BufferGeometry).setFromPoints(projected)
  }

  removePath(id: string): void {
    const line = this.lines.get(id)
    if (!line) return
    this.context.scene.remove(line)
    line.geometry.dispose()
    if (Array.isArray(line.material)) line.material.forEach((m) => m.dispose())
    else line.material.dispose()
    this.lines.delete(id)
  }

  dispose(): void {
    for (const id of [...this.lines.keys()]) this.removePath(id)
  }
}
