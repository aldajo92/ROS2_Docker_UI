import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simSegment2DToThreePoints } from '../mapping/ThreeSimTransform'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'

/**
 * Draws a thin line from each vehicle's pose along its current
 * forward velocity vector (length = `v` meters; clamped at zero so
 * we don't draw a backward line when the vehicle is reversing —
 * reverse should arguably get a different color in a future pass).
 *
 * Only `VehicleEntity` is considered for now; `DynamicActorEntity`
 * stores world-frame velocity in a different field and we don't
 * have a unified velocity getter yet.
 */
export class VelocityVectorRenderer {
  private readonly context: ThreeSceneContext
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Line>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      let line = this.registry.get(vehicle.id)
      if (!line) {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.LineBasicMaterial({ color: 0x66ffcc })
        line = new THREE.Line(geometry, material)
        line.frustumCulled = false
        line.name = 'velocity-vector'
        this.registry.set(vehicle.id, line)
        this.context.scene.add(line)
      }

      const speed = Math.max(0, vehicle.v)
      const yaw = vehicle.pose.yaw
      const tip = vehicle.pose.position.with({
        x: vehicle.pose.position.x + Math.cos(yaw) * speed,
        y: vehicle.pose.position.y + Math.sin(yaw) * speed,
      })
      const [a, b] = simSegment2DToThreePoints(vehicle.pose.position, tip, 0.05)
      ;(line.geometry as THREE.BufferGeometry).setFromPoints([a, b])
    }

    for (const [id, line] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(line)
        disposeObject3D(line)
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const line of this.registry.values()) {
      this.context.scene.remove(line)
      disposeObject3D(line)
    }
    this.registry.clear()
  }
}
