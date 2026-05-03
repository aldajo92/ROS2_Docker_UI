import * as THREE from 'three'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { simPoint2DToThree } from '../mapping/simToThree'
import { PATH_COLOR } from '../config/VisualStyle'

const PATH_HEIGHT = 0.06

export class ThreePathRenderer {
  private readonly context: ThreeSceneContext
  private readonly lines = new Map<string, THREE.Line>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const paths = state.paths.toArray()
    const activeIds = new Set(paths.map((p) => p.id))

    for (const id of [...this.lines.keys()]) {
      if (!activeIds.has(id)) this.removeLine(id)
    }

    for (const path of paths) {
      let line = this.lines.get(path.id)
      if (!line) {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.LineBasicMaterial({ color: PATH_COLOR })
        line = new THREE.Line(geometry, material)
        line.frustumCulled = false
        line.name = `path:${path.id}`
        this.lines.set(path.id, line)
        this.context.scene.add(line)
      }
      const projected = path.points.map((p) =>
        simPoint2DToThree(Point2D.of(p.x, p.y), PATH_HEIGHT),
      )
        ; (line.geometry as THREE.BufferGeometry).setFromPoints(projected)
    }
  }

  dispose(): void {
    for (const id of [...this.lines.keys()]) this.removeLine(id)
  }

  private removeLine(id: string): void {
    const line = this.lines.get(id)
    if (!line) return
    this.context.scene.remove(line)
    line.geometry.dispose()
    if (Array.isArray(line.material)) line.material.forEach((m) => m.dispose())
    else line.material.dispose()
    this.lines.delete(id)
  }
}
