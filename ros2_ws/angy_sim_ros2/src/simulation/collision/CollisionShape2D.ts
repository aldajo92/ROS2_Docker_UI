/**
 * Backend-agnostic collision primitives. Lives in `src/simulation`
 * and therefore must NOT depend on Rapier, Three.js, the DOM, or any
 * renderer. Backends translate these shapes into their own native
 * representation.
 *
 * Convention:
 *   - All coordinates are in simulation X/Y meters.
 *   - `yaw` is in radians, CCW positive (right-hand rule about +Z).
 *   - The simulation +Z axis exists conceptually as "up" but is NOT
 *     used in collision detection in this phase. There is no `z`
 *     and no `height` field — collision is purely 2D.
 */
export type CollisionShape2D = CircleCollisionShape2D | OrientedBoxCollisionShape2D

export interface CollisionShape2DBase {
  /** Owning entity id; backends echo this back in `CollisionContact2D`. */
  entityId: string
  /** Sensor (trigger) shapes detect overlap but produce no contact response. */
  isSensor?: boolean
  /** Free-form metadata; never inspected by `CollisionSystem`. */
  metadata?: Record<string, unknown>
}

export interface CircleCollisionShape2D extends CollisionShape2DBase {
  type: 'circle'
  center: { x: number; y: number }
  /** Meters. */
  radius: number
}

export interface OrientedBoxCollisionShape2D extends CollisionShape2DBase {
  type: 'oriented_box'
  pose: { x: number; y: number; yaw: number }
  /** Full extent along the local +Y axis (forward), meters. */
  length: number
  /** Full extent along the local +X axis (right), meters. */
  width: number
}
