import * as THREE from 'three'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { PoseArray2D } from '../../../../simulation/poses/PoseArray2D'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { setSimPose2D } from '../mapping/ThreeSimTransform'
import { createArrow } from './createArrow'

/**
 * Ground-plane lift for pose-array arrows, in meters. Kept just above
 * zero to avoid z-fighting with the ground grid while still reading as
 * "on the ground" from eye-level cameras. Matches the trajectory
 * renderer's default height so stacked overlays (trajectory ⇒ path ⇒
 * arrow) feel like part of the same horizontal decoration layer.
 *
 * An earlier value (`0.08`) was chosen when the renderer was writing
 * the lift into `three.z` (depth, not up) as part of a broken
 * coordinate conversion, which hid the lift entirely. Once the lift
 * correctly landed on `three.y`, the 8 cm gap above the ground became
 * obvious. Realigning with the rest of the ground overlays fixes the
 * floating appearance without reintroducing z-fighting.
 */
const POSE_ARROW_HEIGHT = 0.03
const DEFAULT_ARROW_SIZE = 0.5
const DEFAULT_THICKNESS = 2
const DEFAULT_COLOR = '#00bcd4'

/**
 * Renders `state.poseArrays` as arrow groups in the Three.js scene.
 * Each `PoseArray2D` owns one `THREE.Group` (keyed by id) containing
 * one arrow per pose. Arrows point in the yaw direction (local +X
 * rotated by yaw around Z).
 */
export class ThreePoseArrayRenderer {
  private readonly context: ThreeSceneContext
  /** Map from PoseArray2D.id → the group holding all its arrows. */
  private readonly groups = new Map<string, THREE.Group>()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const poseArrays = state.poseArrays.toArray()
    const activeIds = new Set(poseArrays.map((pa) => pa.id))

    for (const id of [...this.groups.keys()]) {
      if (!activeIds.has(id)) this.removeGroup(id)
    }

    for (const poseArray of poseArrays) {
      // Always rebuild the group when the pose array changes — pose counts
      // can vary message-to-message and rebuilding is simpler than diffing.
      this.removeGroup(poseArray.id)
      this.createGroup(poseArray)
    }
  }

  dispose(): void {
    for (const id of [...this.groups.keys()]) this.removeGroup(id)
  }

  private createGroup(poseArray: PoseArray2D): void {
    const color = parseColor(poseArray.color ?? DEFAULT_COLOR)
    const arrowSize = poseArray.arrowSize ?? DEFAULT_ARROW_SIZE
    const thickness = poseArray.thickness ?? DEFAULT_THICKNESS

    // Proportional arrow dimensions based on arrowSize and thickness.
    const shaftRadius = (thickness / 10) * 0.04
    const tipRadius = shaftRadius * 2.5
    const tipLength = arrowSize * 0.3

    const group = new THREE.Group()
    group.name = `poseArray:${poseArray.id}`

    for (const pose of poseArray.poses) {
      const arrow = createArrow({
        length: arrowSize,
        shaftRadius,
        tipRadius,
        tipLength,
        color,
        unlit: true,
      })
      setSimPose2D(arrow, { position: Point2D.of(pose.x, pose.y), yaw: pose.yaw }, POSE_ARROW_HEIGHT)
      group.add(arrow)
    }

    this.context.scene.add(group)
    this.groups.set(poseArray.id, group)
  }

  private removeGroup(id: string): void {
    const group = this.groups.get(id)
    if (!group) return
    this.context.scene.remove(group)
    disposeGroup(group)
    this.groups.delete(id)
  }
}

function parseColor(hex: string): number {
  return parseInt(hex.replace('#', ''), 16)
}

function disposeGroup(group: THREE.Group): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose())
      } else {
        obj.material.dispose()
      }
    }
  })
}
