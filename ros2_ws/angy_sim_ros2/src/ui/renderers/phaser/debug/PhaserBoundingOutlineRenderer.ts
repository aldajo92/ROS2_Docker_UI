import type Phaser from 'phaser'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import { Point2D } from '../../../../math/geometry/Point2D'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import {
  simLengthToPhaser,
  simPoint2DToPhaser,
  simYawToPhaserRotation,
} from '../mapping/simToPhaser'
import {
  BOUNDING_CIRCLE_COLOR,
  BOUNDING_CIRCLE_OPACITY,
  VEHICLE_LENGTH_RATIO,
  VEHICLE_WIDTH_RATIO,
} from '../objects/VisualStyle'
import {
  resolveBoundingOutline,
  type BoundingOutline,
} from '../../debug/resolveBoundingOutline'
import type {
  DebugOverlayConfig,
  VehicleBoundingOutlineShape,
} from '../../debug/DebugOverlayConfig'

const STROKE_WIDTH_PX = 2

/**
 * Shape-aware Phaser debug outline. Replaces
 * `PhaserBoundingCircleRenderer`. Draws a stroked `Arc` for circular
 * outlines and a stroked `Rectangle` for rectangle outlines. The
 * shape decision is delegated to the pure `resolveBoundingOutline`
 * helper so it stays in sync with the Three.js renderer.
 *
 * Entries are keyed by `(entityId, kind)` so a vehicle switching
 * between circle and rectangle modes cleanly swaps its game object
 * instead of mutating an existing one.
 */
type OutlineObject = Phaser.GameObjects.Arc | Phaser.GameObjects.Rectangle

interface OutlineEntry {
  kind: BoundingOutline['kind']
  object: OutlineObject
}

export class PhaserBoundingOutlineRenderer {
  private readonly context: PhaserSceneContext
  private readonly entries = new Map<string, OutlineEntry>()
  private vehicleShape: VehicleBoundingOutlineShape

  constructor(
    context: PhaserSceneContext,
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
    const viewport = this.context.viewport
    const ppm = viewport.pixelsPerMeter

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
        entry?.object.destroy()
        entry = {
          kind: outline.kind,
          object: this.createObject(outline),
        }
        this.entries.set(outline.entityId, entry)
      }
      this.updateObject(entry.object, outline, ppm)
    }

    for (const [id, entry] of [...this.entries.entries()]) {
      if (!liveIds.has(id)) {
        entry.object.destroy()
        this.entries.delete(id)
      }
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) entry.object.destroy()
    this.entries.clear()
  }

  private createObject(outline: BoundingOutline): OutlineObject {
    if (outline.kind === 'circle') {
      // `Arc` has no cheap stroke-only primitive — fill-alpha = 0 plus
      // `setStrokeStyle` is the canonical "ring" pattern in Phaser.
      const arc = this.context.scene.add.circle(0, 0, 0, 0x000000, 0)
      arc.setStrokeStyle(
        STROKE_WIDTH_PX,
        BOUNDING_CIRCLE_COLOR,
        BOUNDING_CIRCLE_OPACITY,
      )
      arc.setName(`bounding-outline:${outline.entityId}:circle`)
      return arc
    }

    const rect = this.context.scene.add.rectangle(0, 0, 1, 1, 0x000000, 0)
    rect.setStrokeStyle(
      STROKE_WIDTH_PX,
      BOUNDING_CIRCLE_COLOR,
      BOUNDING_CIRCLE_OPACITY,
    )
    rect.setName(`bounding-outline:${outline.entityId}:rectangle`)
    return rect
  }

  private updateObject(
    object: OutlineObject,
    outline: BoundingOutline,
    ppm: number,
  ): void {
    const screen = simPoint2DToPhaser(
      Point2D.of(outline.center.x, outline.center.y),
      this.context.viewport,
    )
    object.setPosition(screen.x, screen.y)

    if (outline.kind === 'circle') {
      ;(object as Phaser.GameObjects.Arc).setRadius(
        simLengthToPhaser(outline.radius, ppm),
      )
      object.setRotation(0)
      return
    }

    // `setSize` keeps Phaser's internal origin (default center), so the
    // rectangle rotates around its geometric center.
    ;(object as Phaser.GameObjects.Rectangle).setSize(
      simLengthToPhaser(outline.length, ppm),
      simLengthToPhaser(outline.thickness, ppm),
    )
    object.setRotation(simYawToPhaserRotation(outline.yaw))
  }
}
