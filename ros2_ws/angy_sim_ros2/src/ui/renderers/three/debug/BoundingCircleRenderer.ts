import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { disposeObject3D } from '../core/threeDisposal'
import { simPoint2DToThree } from '../mapping/simToThree'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { Entity } from '../../../../simulation/entities/Entity'

/**
 * Draws a thin horizontal ring at each entity's bounding-circle
 * radius. We treat any entity that exposes `radius` and either
 * `position: Point2D` or `pose.position: Point2D` as drawable —
 * keeps this renderer entity-agnostic.
 */
export class BoundingCircleRenderer {
  private readonly context: ThreeSceneContext
  private readonly registry = new ThreeRenderObjectRegistry<THREE.LineLoop>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const liveIds = new Set<string>()

    for (const entity of state.entities.all()) {
      const sample = sampleEntity(entity)
      if (!sample) continue
      liveIds.add(entity.id)

      let loop = this.registry.get(entity.id)
      if (!loop) {
        loop = createCircleLoop(sample.radius)
        this.registry.set(entity.id, loop)
        this.context.scene.add(loop)
      }
      loop.position.copy(
        simPoint2DToThree(Point2D.of(sample.position.x, sample.position.y), 0.02),
      )
    }

    for (const [id, loop] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(loop)
        disposeObject3D(loop)
        this.registry.delete(id)
      }
    }
  }

  dispose(): void {
    for (const loop of this.registry.values()) {
      this.context.scene.remove(loop)
      disposeObject3D(loop)
    }
    this.registry.clear()
  }
}

function sampleEntity(
  entity: Entity,
): { position: { x: number; y: number }; radius: number } | undefined {
  const e = entity as Entity & {
    radius?: number
    position?: { x: number; y: number }
    pose?: { position: { x: number; y: number } }
  }
  if (typeof e.radius !== 'number') return undefined
  if (e.pose?.position) return { position: e.pose.position, radius: e.radius }
  if (e.position) return { position: e.position, radius: e.radius }
  return undefined
}

function createCircleLoop(radius: number, segments = 48): THREE.LineLoop {
  const points: THREE.Vector3[] = []
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    // Circle lives in the three.js XZ plane (= sim ground).
    points.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius))
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: 0xfff066 })
  const loop = new THREE.LineLoop(geometry, material)
  loop.frustumCulled = false
  loop.name = 'bounding-circle'
  return loop
}
