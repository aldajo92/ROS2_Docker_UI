import * as THREE from 'three'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { LidarScan2D } from '../../../../simulation/sensors/LidarScan2D'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { simPoint2DToThree } from '../mapping/simToThree'

/** Height of lidar geometry above the ground plane (sim metres → three Y). */
const LIDAR_HEIGHT = 0.08

/** Visual style — faint blue rays, brighter cyan hit dots. */
const RAY_COLOR = 0x2a7bff
const HIT_COLOR = 0x00ffff
const RAY_OPACITY = 0.3
const HIT_SPHERE_RADIUS = 0.04

/**
 * Renders the latest lidar scan per sensor from `state.lidarScans`.
 *
 * One `THREE.Group` per scan id: contains line segments for rays and
 * small sphere sprites for hit points. Groups are disposed when the
 * corresponding scan id disappears from the registry.
 *
 * Reads from `state.lidarScans.toArray()` — never mutates state.
 */
export class ThreeLidarScanRenderer {
  private readonly context: ThreeSceneContext
  private readonly groups = new Map<string, THREE.Group>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const scans = state.lidarScans.toArray()
    const activeIds = new Set(scans.map((s) => s.id))

    // Remove stale groups whose scan is no longer in the registry.
    for (const id of [...this.groups.keys()]) {
      if (!activeIds.has(id)) {
        this.removeGroup(id)
      }
    }

    for (const scan of scans) {
      let group = this.groups.get(scan.id)
      if (!group) {
        group = new THREE.Group()
        group.name = `lidar:${scan.id}`
        this.context.scene.add(group)
        this.groups.set(scan.id, group)
      }
      this.updateGroup(group, scan)
    }
  }

  dispose(): void {
    for (const id of [...this.groups.keys()]) {
      this.removeGroup(id)
    }
  }

  // ---------------------------------------------------------------------------

  private updateGroup(group: THREE.Group, scan: LidarScan2D): void {
    // Clear previous frame geometry.
    for (const child of [...group.children]) {
      group.remove(child)
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else (mat as THREE.Material).dispose()
      }
    }

    const rayCount = scan.ranges.length
    if (rayCount === 0) return

    // World-space sensor origin and orientation stored in the scan.
    // Fall back to (0,0,0) for replay files written before these fields exist.
    const ox = scan.originX ?? 0
    const oy = scan.originY ?? 0
    const worldYaw = scan.worldYaw ?? 0
    const originThree = simPoint2DToThree(Point2D.of(ox, oy), LIDAR_HEIGHT)

    // Build ray line segments as a single BufferGeometry for efficiency.
    const positions: number[] = []
    const hitPositions: number[] = []

    for (let i = 0; i < rayCount; i++) {
      // World-space ray angle: sensor world yaw + local scan angle.
      const angle = worldYaw + scan.angleMin + i * scan.angleIncrement
      const r = scan.ranges[i]

      // Ray endpoint in world sim coordinates.
      const ex = ox + Math.cos(angle) * r
      const ey = oy + Math.sin(angle) * r
      const ep = simPoint2DToThree(Point2D.of(ex, ey), LIDAR_HEIGHT)

      // Ray line: sensor origin → endpoint.
      positions.push(originThree.x, originThree.y, originThree.z, ep.x, ep.y, ep.z)

      if (r < scan.rangeMax * 0.999) {
        hitPositions.push(ep.x, ep.y, ep.z)
      }
    }

    // Ray lines
    if (positions.length > 0) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(positions, 3),
      )
      const mat = new THREE.LineBasicMaterial({
        color: RAY_COLOR,
        transparent: true,
        opacity: RAY_OPACITY,
      })
      const lines = new THREE.LineSegments(geo, mat)
      lines.frustumCulled = false
      group.add(lines)
    }

    // Hit point spheres — instanced for performance
    if (hitPositions.length > 0) {
      const count = hitPositions.length / 3
      const geo = new THREE.SphereGeometry(HIT_SPHERE_RADIUS, 4, 4)
      const mat = new THREE.MeshBasicMaterial({ color: HIT_COLOR })
      const mesh = new THREE.InstancedMesh(geo, mat, count)
      mesh.frustumCulled = false
      const dummy = new THREE.Object3D()
      for (let i = 0; i < count; i++) {
        dummy.position.set(
          hitPositions[i * 3],
          hitPositions[i * 3 + 1],
          hitPositions[i * 3 + 2],
        )
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      group.add(mesh)
    }
  }

  private removeGroup(id: string): void {
    const group = this.groups.get(id)
    if (!group) return
    for (const child of [...group.children]) {
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose()
      if ((child as THREE.Mesh).material) {
        const mat = (child as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else (mat as THREE.Material).dispose()
      }
    }
    this.context.scene.remove(group)
    this.groups.delete(id)
  }
}
