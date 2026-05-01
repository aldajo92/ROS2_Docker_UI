import { Point2D } from '../../math/geometry/Point2D'
import { BaseEntity } from './BaseEntity'

/**
 * Shape variants supported by {@link StaticObstacleEntity}. Framework-free:
 * plain data, no class instances, safe to serialize.
 *
 * Convention for rectangles:
 *   - `length` is the local **forward** extent (along local +X after the
 *     entity's `position` has been rotated by `yaw`).
 *   - `thickness` is the local **lateral** extent.
 *   - `yaw` is in radians, CCW positive, same convention as the rest of
 *     the 2D math module.
 *
 * This shape data is normalized at construction time: scenarios authored
 * with `mode: 'segment'` are converted to `{ length, thickness, yaw }` by
 * the `ScenarioLoader` before they reach the entity. Renderers and the
 * collision shape builder therefore only ever see this normalized form.
 */
export type ObstacleShape2D = ObstacleCircle2D | ObstacleRectangle2D

export interface ObstacleCircle2D {
  type: 'circle'
  /** Meters. */
  radius: number
}

export interface ObstacleRectangle2D {
  type: 'rectangle'
  /** Local forward extent (meters). */
  length: number
  /** Local lateral extent (meters). */
  thickness: number
  /** Orientation in radians, CCW positive, around sim +Z. */
  yaw: number
}

export interface StaticObstacleEntityOptions {
  id: string
  /** Center of the obstacle (circle center or rectangle center). */
  position: Point2D
  /**
   * Preferred: an explicit shape descriptor. When omitted and `radius`
   * is provided, the entity falls back to a circle — this is what keeps
   * legacy callers `new StaticObstacleEntity({ id, position, radius })`
   * working unchanged.
   */
  shape?: ObstacleShape2D
  /**
   * Legacy shortcut: providing `radius` without `shape` yields a circle
   * with that radius. When `shape` is provided, this field is ignored.
   */
  radius?: number
}

/**
 * Inert obstacle. Position / shape never change after construction; the
 * default no-op `update` from BaseEntity is sufficient.
 *
 * Backward compatibility:
 *   - `new StaticObstacleEntity({ id, position, radius })` still works.
 *   - `entity.radius` is still a number on every instance. For
 *     rectangles it is the bounding circle radius
 *     (`hypot(length/2, thickness/2)`), which is what the simple
 *     circle-based collision backend uses as a coarse filter and what
 *     old UI panels / replay snapshots read.
 *   - `entity.shape` carries the authoritative geometry for renderers
 *     and for `buildCollisionShapes2DFromState`.
 */
export class StaticObstacleEntity extends BaseEntity {
  readonly position: Point2D
  readonly shape: ObstacleShape2D
  /**
   * Bounding circle radius, in meters. For circles this is the circle's
   * own radius; for rectangles this is the enclosing circle — not used
   * by the renderer (which reads `shape` directly) but kept so legacy
   * code paths (`snapshot.radius`, debug overlays) still work.
   */
  readonly radius: number

  constructor(options: StaticObstacleEntityOptions) {
    super(options.id, 'static_obstacle')
    this.position = options.position
    if (options.shape) {
      this.shape = options.shape
      this.radius = boundingRadiusOf(options.shape)
    } else if (options.radius !== undefined) {
      this.shape = { type: 'circle', radius: options.radius }
      this.radius = options.radius
    } else {
      throw new Error(
        `StaticObstacleEntity "${options.id}" requires either a shape or a radius`,
      )
    }
  }
}

function boundingRadiusOf(shape: ObstacleShape2D): number {
  if (shape.type === 'circle') return shape.radius
  return Math.hypot(shape.length / 2, shape.thickness / 2)
}
