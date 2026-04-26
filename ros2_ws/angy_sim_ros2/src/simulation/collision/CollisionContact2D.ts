/**
 * One contact between two entities, in simulation X/Y space.
 *
 * `normal` and `penetrationDepth` are optional because not every
 * backend reports them (e.g. Rapier sensor / intersection-only paths).
 * Consumers must tolerate them being undefined.
 */
export interface CollisionContact2D {
  entityAId: string
  entityBId: string
  /** 2D unit normal in simulation X/Y, pointing from A → B. */
  normal?: { x: number; y: number }
  /** Meters. Always >= 0 when present. */
  penetrationDepth?: number
  /** True iff this is the leading edge of a contact (computed by
   *  `CollisionSystem`, not by backends). */
  started?: boolean
  metadata?: Record<string, unknown>
}
