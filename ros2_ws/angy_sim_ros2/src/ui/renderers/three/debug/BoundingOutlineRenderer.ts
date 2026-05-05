import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { disposeObject3D } from '../core/threeDisposal'
import { setSimPosition2D, setSimYaw } from '../mapping/ThreeSimTransform'
import { Point2D } from '../../../../math/geometry/Point2D'
import {
  VEHICLE_LENGTH_RATIO,
  VEHICLE_WIDTH_RATIO,
} from '../config/VisualStyle'
import {
  resolveBoundingOutline,
  type BoundingOutline,
} from '../../debug/resolveBoundingOutline'
import type {
  DebugOverlayConfig,
  VehicleBoundingOutlineShape,
} from '../../debug/DebugOverlayConfig'

/** Hex color for the bounding outline stroke. Matches the previous
 *  `BoundingCircleRenderer` look so the visual identity is preserved
 *  across the rename. */
const OUTLINE_COLOR = 0xfff066

/** Y-height of the outline above the ground plane, meters. Matches
 *  the legacy value so the outline stays readable without z-fighting
 *  the ground grid. */
const OUTLINE_LIFT_M = 0.02

const CIRCLE_SEGMENTS = 48

/**
 * Shape-aware bounding outline renderer (Three.js).
 *
 * Replaces the legacy `BoundingCircleRenderer`. The decision of which
 * shape to draw for which entity lives in `resolveBoundingOutline`
 * (pure, unit-tested); this class only knows how to *draw* the result
 * as a `THREE.LineLoop`.
 *
 * Per-entity mesh entries are keyed by (entity id + outline kind) so
 * a vehicle switching between circle and rectangle modes, or a future
 * obstacle swap, cleanly replaces its loop instead of mutating an
 * existing circle geometry in place.
 */
interface OutlineEntry {
  kind: BoundingOutline['kind']
  loop: THREE.LineLoop
}

export class BoundingOutlineRenderer {
  private readonly context: ThreeSceneContext
  private readonly entries = new Map<string, OutlineEntry>()
  private vehicleShape: VehicleBoundingOutlineShape

  constructor(
    context: ThreeSceneContext,
    config: Pick<DebugOverlayConfig, 'vehicleBoundingOutlineShape'> = {
      vehicleBoundingOutlineShape: 'circle',
    },
  ) {
    this.context = context
    this.vehicleShape = config.vehicleBoundingOutlineShape
  }

  setConfig(
    config: Partial<Pick<DebugOverlayConfig, 'vehicleBoundingOutlineShape'>>,
  ): void {
    if (config.vehicleBoundingOutlineShape !== undefined) {
      this.vehicleShape = config.vehicleBoundingOutlineShape
    }
  }

  sync(state: SimulationState): void {
    const liveIds = new Set<string>()

    for (const entity of state.entities.all()) {
      const outline = resolveBoundingOutline(entity, {
        vehicleShape: this.vehicleShape,
        vehicleLengthRatio: VEHICLE_LENGTH_RATIO,
        vehicleWidthRatio: VEHICLE_WIDTH_RATIO,
      })
      if (!outline) continue
      liveIds.add(outline.entityId)

      let entry = this.entries.get(outline.entityId)
      if (!entry || entry.kind !== outline.kind) {
        if (entry) {
          this.context.scene.remove(entry.loop)
          disposeObject3D(entry.loop)
        }
        const loop = createLoopFor(outline)
        this.context.scene.add(loop)
        entry = { kind: outline.kind, loop }
        this.entries.set(outline.entityId, entry)
      } else {
        // Same kind — update geometry if the dimensions changed.
        refreshLoopGeometry(entry.loop, outline)
      }

      positionLoop(entry.loop, outline)
    }

    for (const [id, entry] of [...this.entries.entries()]) {
      if (!liveIds.has(id)) {
        this.context.scene.remove(entry.loop)
        disposeObject3D(entry.loop)
        this.entries.delete(id)
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.context.scene.remove(entry.loop)
      disposeObject3D(entry.loop)
    }
    this.entries.clear()
  }
}

function createLoopFor(outline: BoundingOutline): THREE.LineLoop {
  const points =
    outline.kind === 'circle'
      ? circlePoints(outline.radius, CIRCLE_SEGMENTS)
      : rectanglePoints(outline.length, outline.thickness)

  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: OUTLINE_COLOR })
  const loop = new THREE.LineLoop(geometry, material)
  loop.frustumCulled = false
  loop.name = `bounding-outline:${outline.entityId}:${outline.kind}`
  return loop
}

function refreshLoopGeometry(
  loop: THREE.LineLoop,
  outline: BoundingOutline,
): void {
  const points =
    outline.kind === 'circle'
      ? circlePoints(outline.radius, CIRCLE_SEGMENTS)
      : rectanglePoints(outline.length, outline.thickness)

  loop.geometry.dispose()
  loop.geometry = new THREE.BufferGeometry().setFromPoints(points)
}

function positionLoop(
  loop: THREE.LineLoop,
  outline: BoundingOutline,
): void {
  setSimPosition2D(loop, Point2D.of(outline.center.x, outline.center.y), OUTLINE_LIFT_M)
  // Circles are rotationally symmetric so their yaw is irrelevant;
  // still reset the rotation in case we swapped shape kinds.
  const yaw = outline.kind === 'rectangle' ? outline.yaw : 0
  setSimYaw(loop, yaw)
}

/** Points on the sim ground plane (XZ in three space, see
 *  `simToThree` for the mapping). Centered on the origin of the
 *  owning mesh. */
function circlePoints(radius: number, segments: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2
    out.push(
      new THREE.Vector3(
        Math.cos(theta) * radius,
        0,
        Math.sin(theta) * radius,
      ),
    )
  }
  return out
}

/**
 * Four corners of a rectangle centered at the mesh origin. The
 * rectangle's local +X (length) maps to three +X, and its local +Y
 * (thickness) maps to three −Z (same convention as
 * `simPoint2DToThree`). The mesh's `rotation.y` then applies the
 * sim yaw, keeping yaw conversion in the canonical helper.
 */
function rectanglePoints(
  length: number,
  thickness: number,
): THREE.Vector3[] {
  const hx = length / 2
  const hy = thickness / 2
  return [
    new THREE.Vector3(+hx, 0, -(+hy)),
    new THREE.Vector3(+hx, 0, -(-hy)),
    new THREE.Vector3(-hx, 0, -(-hy)),
    new THREE.Vector3(-hx, 0, -(+hy)),
  ]
}
