import { Point2D } from '../../math/geometry/Point2D'
import { BaseEntity } from './BaseEntity'

export interface StaticObstacleEntityOptions {
  id: string
  position: Point2D
  /** Bounding circle radius, in meters. */
  radius: number
}

/**
 * Inert obstacle. Position never changes after construction; the
 * default no-op `update` from BaseEntity is sufficient.
 */
export class StaticObstacleEntity extends BaseEntity {
  readonly position: Point2D
  readonly radius: number

  constructor(options: StaticObstacleEntityOptions) {
    super(options.id, 'static_obstacle')
    this.position = options.position
    this.radius = options.radius
  }
}
