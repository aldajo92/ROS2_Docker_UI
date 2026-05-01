import type { Entity } from '../../../simulation/entities/Entity'
import { VehicleEntity } from '../../../simulation/entities/VehicleEntity'
import { StaticObstacleEntity } from '../../../simulation/entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../../../simulation/entities/DynamicActorEntity'
import type { VehicleBoundingOutlineShape } from './DebugOverlayConfig'

/**
 * Framework-free mapping from a simulation entity to the debug
 * bounding outline the renderer should draw for it. Both the Three.js
 * and Phaser debug layers call this helper so the "what shape do we
 * draw for this entity" decision lives in exactly one place.
 *
 * The helper does **not** mutate the entity and does **not** import
 * any renderer / React / DOM symbol. Output is a plain discriminated
 * union; each renderer projects the 2D shape into its own render
 * space (`simPoint2DToThree` / `simPoint2DToPhaser`).
 *
 * Vehicle rectangle dimensions are derived from the vehicle's
 * `radius` scaled by the caller-supplied `VEHICLE_LENGTH_RATIO` /
 * `VEHICLE_WIDTH_RATIO`. Those ratios already live per adapter in
 * `VisualStyle.ts`; pulling them in as parameters keeps this helper
 * adapter-agnostic.
 *
 * See `doc/Architecture.md` → "Debug bounding outlines".
 */
export type BoundingOutline =
  | BoundingOutlineCircle
  | BoundingOutlineRectangle

export interface BoundingOutlineCircle {
  kind: 'circle'
  entityId: string
  center: { x: number; y: number }
  radius: number
}

export interface BoundingOutlineRectangle {
  kind: 'rectangle'
  entityId: string
  center: { x: number; y: number }
  /** Local forward extent (along local +X after `yaw`). */
  length: number
  /** Local lateral extent. */
  thickness: number
  /** Radians, CCW positive, same convention as `Pose2D.yaw`. */
  yaw: number
}

export interface ResolveBoundingOutlineOptions {
  /** Which shape to use for `VehicleEntity`. */
  vehicleShape: VehicleBoundingOutlineShape
  /** Vehicle length / radius, matching the adapter's VisualStyle. */
  vehicleLengthRatio: number
  /** Vehicle width / radius, matching the adapter's VisualStyle. */
  vehicleWidthRatio: number
}

/**
 * Returns the outline to draw for `entity`, or `undefined` when the
 * entity type has no bounding-outline rule (e.g. grid, non-collidable
 * markers). Unknown entity types never throw — an unknown entity
 * simply gets no overlay.
 */
export function resolveBoundingOutline(
  entity: Entity,
  options: ResolveBoundingOutlineOptions,
): BoundingOutline | undefined {
  if (entity instanceof VehicleEntity) {
    const center = {
      x: entity.pose.position.x,
      y: entity.pose.position.y,
    }
    if (options.vehicleShape === 'rectangle') {
      return {
        kind: 'rectangle',
        entityId: entity.id,
        center,
        length: entity.radius * options.vehicleLengthRatio,
        thickness: entity.radius * options.vehicleWidthRatio,
        yaw: entity.pose.yaw,
      }
    }
    return {
      kind: 'circle',
      entityId: entity.id,
      center,
      radius: entity.radius,
    }
  }

  if (entity instanceof StaticObstacleEntity) {
    const center = { x: entity.position.x, y: entity.position.y }
    if (entity.shape.type === 'rectangle') {
      return {
        kind: 'rectangle',
        entityId: entity.id,
        center,
        length: entity.shape.length,
        thickness: entity.shape.thickness,
        yaw: entity.shape.yaw,
      }
    }
    return {
      kind: 'circle',
      entityId: entity.id,
      center,
      radius: entity.shape.radius,
    }
  }

  if (entity instanceof DynamicActorEntity) {
    return {
      kind: 'circle',
      entityId: entity.id,
      center: {
        x: entity.pose.position.x,
        y: entity.pose.position.y,
      },
      radius: entity.radius,
    }
  }

  return undefined
}
