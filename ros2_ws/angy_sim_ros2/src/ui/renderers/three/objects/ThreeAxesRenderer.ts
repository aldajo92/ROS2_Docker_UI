import * as THREE from 'three'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { createArrow } from './createArrow'
import { simDirection3DToThree } from '../mapping/simToThree'
import {
  AXIS_GROUND_LIFT_M,
  AXIS_LENGTH_M,
  AXIS_SHAFT_RADIUS_M,
  AXIS_TIP_LENGTH_M,
  AXIS_TIP_RADIUS_M,
  AXIS_X_COLOR,
  AXIS_Y_COLOR,
  AXIS_Z_COLOR,
  ORIGIN_MARKER_COLOR,
  ORIGIN_MARKER_SIDE_M,
  ORIGIN_MARKER_THICKNESS_M,
} from '../config/VisualStyle'

/**
 * World-axis gizmo at the simulation origin. Shows the ROS / Gazebo
 * convention: X = red, Y = green, Z = blue, right-handed.
 *
 * Custom arrows (not `THREE.AxesHelper`) for two reasons:
 *   1. `AxesHelper` paints lines along three's native axes, which —
 *      under our sim→three mapping — are *not* the simulation axes.
 *      Showing them would teach the user the wrong frame.
 *   2. We want consistent geometry with the heading arrow on the
 *      vehicle, which uses the same `createArrow` primitive.
 *
 * Each axis arrow's local +X is rotated to point along the requested
 * **simulation** axis, expressed in three coordinates via
 * `simDirection3DToThree`. The renderer therefore knows nothing about
 * the actual sim→three mapping math — that lives in one place.
 *
 * A small flat green box marks the origin so it stays identifiable
 * even when an obstacle overlaps it.
 */
export class ThreeAxesRenderer {
  private readonly context: ThreeSceneContext
  private group?: THREE.Group

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  init(): void {
    if (this.group) return
    const group = new THREE.Group()
    group.name = 'world-axes'

    // Lift the whole gizmo a hair above the ground plane to avoid
    // z-fighting with the ground / grid. The lift is in *three* +Y
    // since that's "up" in three.
    group.position.y = AXIS_GROUND_LIFT_M

    group.add(this.buildAxisArrow(AXIS_X_COLOR, 'x', 1, 0, 0))
    group.add(this.buildAxisArrow(AXIS_Y_COLOR, 'y', 0, 1, 0))
    group.add(this.buildAxisArrow(AXIS_Z_COLOR, 'z', 0, 0, 1))
    group.add(buildOriginMarker())

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

  /**
   * One axis arrow. The arrow primitive lives along its local +X; we
   * rotate it so its forward aligns with the requested sim axis
   * (mapped to three space).
   */
  private buildAxisArrow(
    color: number,
    name: string,
    simX: number,
    simY: number,
    simZ: number,
  ): THREE.Group {
    const arrow = createArrow({
      length: AXIS_LENGTH_M,
      shaftRadius: AXIS_SHAFT_RADIUS_M,
      tipRadius: AXIS_TIP_RADIUS_M,
      tipLength: AXIS_TIP_LENGTH_M,
      color,
    })
    arrow.name = `axis-${name}`

    const targetDir = simDirection3DToThree(simX, simY, simZ).normalize()
    const localForward = new THREE.Vector3(1, 0, 0)
    arrow.quaternion.setFromUnitVectors(localForward, targetDir)
    return arrow
  }
}

function buildOriginMarker(): THREE.Mesh {
  // Sim dimensions (X, Y, Z) → three (X, Z, Y) — magnitudes only,
  // so the box is symmetric under the sign-flip. The marker is a
  // flat square pad of thickness `ORIGIN_MARKER_THICKNESS_M` along
  // sim +Z (= three +Y).
  const geometry = new THREE.BoxGeometry(
    ORIGIN_MARKER_SIDE_M,
    ORIGIN_MARKER_THICKNESS_M,
    ORIGIN_MARKER_SIDE_M,
  )
  const material = new THREE.MeshStandardMaterial({
    color: ORIGIN_MARKER_COLOR,
    roughness: 0.7,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'origin-marker'
  mesh.position.y = ORIGIN_MARKER_THICKNESS_M / 2
  return mesh
}
