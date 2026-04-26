import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree } from '../mapping/simToThree'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { TRAIL_COLOR } from '../config/VisualStyle'

/**
 * Visual-only breadcrumb trail for vehicles. Trail points live ONLY
 * in this renderer — never on the entity — so swapping renderers or
 * disabling visuals doesn't leak memory in the simulation core.
 *
 * Implementation: a per-vehicle sliding window of `THREE.Vector3`s.
 * On every `sync` we push the latest position, drop the head when we
 * exceed `maxPoints`, and call `BufferGeometry.setFromPoints(...)`.
 * For the default 200-point cap this is comfortably under a
 * millisecond and avoids the visual "wrap-around segment" artifact
 * a naive ring buffer + `THREE.Line` produces.
 *
 * `clear()` is called from the renderer on `reset`/`scenarioLoaded`
 * so a new run starts with empty trails.
 */
export class ThreeTrailRenderer {
  private readonly context: ThreeSceneContext
  private readonly maxPoints: number
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Line>()
  private readonly points = new Map<string, THREE.Vector3[]>()

  constructor(context: ThreeSceneContext, maxPoints = 200) {
    this.context = context
    this.maxPoints = maxPoints
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      let line = this.registry.get(vehicle.id)
      let buffer = this.points.get(vehicle.id)
      if (!line) {
        line = this.createTrailLine()
        this.registry.set(vehicle.id, line)
        this.context.scene.add(line)
      }
      if (!buffer) {
        buffer = []
        this.points.set(vehicle.id, buffer)
      }

      buffer.push(simPoint2DToThree(vehicle.pose.position, 0.05))
      if (buffer.length > this.maxPoints) {
        buffer.splice(0, buffer.length - this.maxPoints)
      }
      ;(line.geometry as THREE.BufferGeometry).setFromPoints(buffer)
    }

    for (const [id, line] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(line)
        disposeObject3D(line)
        this.registry.delete(id)
        this.points.delete(id)
      }
    }
  }

  clear(): void {
    for (const [, buffer] of this.points) buffer.length = 0
    for (const line of this.registry.values()) {
      const geom = line.geometry as THREE.BufferGeometry
      geom.setFromPoints([])
    }
  }

  dispose(): void {
    for (const line of this.registry.values()) {
      this.context.scene.remove(line)
      disposeObject3D(line)
    }
    this.registry.clear()
    this.points.clear()
  }

  private createTrailLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry()
    const material = new THREE.LineBasicMaterial({ color: TRAIL_COLOR })
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    line.name = 'vehicle-trail'
    return line
  }
}
