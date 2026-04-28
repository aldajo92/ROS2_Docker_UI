import type { TrajectorySample2D } from './TrajectorySample2D'

export type EntityTrajectory2D = {
  entityId: string
  samples: TrajectorySample2D[]
  metadata?: Record<string, unknown>
}

export type ReadonlyEntityTrajectory2D = {
  readonly entityId: string
  readonly samples: readonly TrajectorySample2D[]
  readonly metadata?: Readonly<Record<string, unknown>>
}
