import type {
  EntityTrajectory2D,
  ReadonlyEntityTrajectory2D,
} from './EntityTrajectory2D'
import type { TrajectorySample2D } from './TrajectorySample2D'

export class TrajectoryRegistry {
  private readonly trajectories = new Map<string, EntityTrajectory2D>()

  add(trajectory: EntityTrajectory2D): void {
    this.trajectories.set(trajectory.entityId, {
      entityId: trajectory.entityId,
      samples: trajectory.samples.map((sample) => ({ ...sample })),
      metadata: trajectory.metadata ? { ...trajectory.metadata } : undefined,
    })
  }

  get(entityId: string): ReadonlyEntityTrajectory2D | undefined {
    const trajectory = this.trajectories.get(entityId)
    if (!trajectory) return undefined
    return this.snapshot(trajectory)
  }

  has(entityId: string): boolean {
    return this.trajectories.has(entityId)
  }

  ensure(entityId: string): void {
    if (!this.trajectories.has(entityId)) {
      this.trajectories.set(entityId, {
        entityId,
        samples: [],
      })
    }
  }

  append(entityId: string, sample: TrajectorySample2D, maxSamples: number): void {
    this.ensure(entityId)
    const trajectory = this.trajectories.get(entityId)
    if (!trajectory) return

    trajectory.samples.push({ ...sample })
    const boundedMax = this.normalizeMaxSamples(maxSamples)
    while (trajectory.samples.length > boundedMax) {
      trajectory.samples.shift()
    }
  }

  pruneOlderThan(entityId: string, minTimeSec: number): void {
    const trajectory = this.trajectories.get(entityId)
    if (!trajectory) return
    trajectory.samples = trajectory.samples.filter(
      (sample) => sample.timeSec >= minTimeSec,
    )
  }

  clear(entityId?: string): void {
    if (entityId !== undefined) {
      this.trajectories.delete(entityId)
      return
    }
    this.trajectories.clear()
  }

  remove(entityId: string): void {
    this.trajectories.delete(entityId)
  }

  toArray(): ReadonlyEntityTrajectory2D[] {
    return [...this.trajectories.values()].map((trajectory) =>
      this.snapshot(trajectory),
    )
  }

  size(): number {
    return this.trajectories.size
  }

  private snapshot(trajectory: EntityTrajectory2D): ReadonlyEntityTrajectory2D {
    return {
      entityId: trajectory.entityId,
      samples: trajectory.samples.map((sample) => ({ ...sample })),
      metadata: trajectory.metadata ? { ...trajectory.metadata } : undefined,
    }
  }

  private normalizeMaxSamples(maxSamples: number): number {
    if (!Number.isFinite(maxSamples)) return 1
    return Math.max(1, Math.floor(maxSamples))
  }
}
