import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'
import {
  DEFAULT_TRAJECTORY_TRACKING_CONFIG,
  type EntityTrajectoryTrackingConfig,
  type TrajectorySamplingMode,
  type TrajectoryTrackingConfig,
} from '../trajectories/TrajectoryTrackingConfig'
import type {
  TrajectoryDebugDecision,
  TrajectoryDebugRecord,
} from '../trajectories/TrajectoryDebugRecord'
import type { TrajectorySample2D } from '../trajectories/TrajectorySample2D'
import { getEntityTrajectoryPose2D } from '../trajectories/getEntityTrajectoryPose2D'

type ResolvedTrajectorySamplingConfig = {
  samplingMode: TrajectorySamplingMode
  maxSamples: number
  timeWindowSec: number
  minSampleDtSec: number
  minDistance: number
}

export class TrajectoryTrackingSystem implements SimulationSystem {
  readonly name = 'trajectoryTracking'
  private readonly lastSampleByEntity = new Map<string, TrajectorySample2D>()

  private config: Required<TrajectoryTrackingConfig> = {
    ...DEFAULT_TRAJECTORY_TRACKING_CONFIG,
    entities: [],
  }

  update(_dt: number, state: SimulationState): void {
    const tick = state.metrics.ticks + 1
    const timeSec = state.clock.time()
    const entities = state.entities.toArray()
    const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))

    for (const entityConfig of this.config.entities) {
      if (entitiesById.has(entityConfig.entityId)) continue
      this.recordDecision(
        state,
        tick,
        timeSec,
        entityConfig.entityId,
        this.resolveSamplingConfig(entityConfig),
        'skipped_missing_entity',
        `entity "${entityConfig.entityId}" not found in current state`,
      )
    }

    if (!this.config.enabled) {
      for (const entity of entities) {
        this.recordDecision(
          state,
          tick,
          timeSec,
          entity.id,
          this.resolveSamplingConfig(this.getEntityConfig(entity.id)),
          'skipped_disabled',
          'trajectory tracking disabled globally',
        )
      }
      return
    }

    for (const entity of entities) {
      const entityConfig = this.getEntityConfig(entity.id)
      const sampling = this.resolveSamplingConfig(entityConfig)
      if (!this.isEntityEnabled(entityConfig)) {
        this.recordDecision(
          state,
          tick,
          timeSec,
          entity.id,
          sampling,
          'skipped_disabled',
          'entity tracking disabled by config',
        )
        continue
      }

      const pose = getEntityTrajectoryPose2D(entity)
      if (!pose) {
        this.recordDecision(
          state,
          tick,
          timeSec,
          entity.id,
          sampling,
          'skipped_unsupported_entity',
          'entity is unsupported by getEntityTrajectoryPose2D',
        )
        continue
      }

      const latest = this.resolveLatestSample(state, entity.id)
      if (latest && timeSec - latest.timeSec < sampling.minSampleDtSec) {
        this.recordDecision(
          state,
          tick,
          timeSec,
          entity.id,
          sampling,
          'skipped_min_sample_dt',
          `delta time ${timeSec - latest.timeSec} < minSampleDtSec ${sampling.minSampleDtSec}`,
          pose,
        )
        continue
      }

      if (latest && Math.hypot(pose.x - latest.x, pose.y - latest.y) < sampling.minDistance) {
        this.recordDecision(
          state,
          tick,
          timeSec,
          entity.id,
          sampling,
          'skipped_min_distance',
          `distance to last sample is below minDistance ${sampling.minDistance}`,
          pose,
        )
        continue
      }

      const sample: TrajectorySample2D = {
        timeSec,
        x: pose.x,
        y: pose.y,
        yaw: pose.yaw,
        speed: pose.speed,
      }
      state.trajectories.append(entity.id, sample, sampling.maxSamples)
      this.lastSampleByEntity.set(entity.id, sample)

      if (sampling.samplingMode === 'timeWindow') {
        state.trajectories.pruneOlderThan(entity.id, timeSec - sampling.timeWindowSec)
      }

      this.recordDecision(
        state,
        tick,
        timeSec,
        entity.id,
        sampling,
        'appended',
        'sample appended',
        pose,
      )
    }
  }

  reset(): void {
    this.lastSampleByEntity.clear()
  }

  setConfig(config?: TrajectoryTrackingConfig): void {
    this.config = this.normalizeTrajectoryTrackingConfig(config)
    this.lastSampleByEntity.clear()
  }

  getConfig(): TrajectoryTrackingConfig {
    return {
      ...this.config,
      entities: this.config.entities.map((entry) => ({ ...entry })),
    }
  }

  private normalizeTrajectoryTrackingConfig(
    config?: TrajectoryTrackingConfig,
  ): Required<TrajectoryTrackingConfig> {
    return {
      enabled: config?.enabled ?? DEFAULT_TRAJECTORY_TRACKING_CONFIG.enabled,
      trackAllSupportedEntities:
        config?.trackAllSupportedEntities ??
        DEFAULT_TRAJECTORY_TRACKING_CONFIG.trackAllSupportedEntities,
      defaultSamplingMode:
        config?.defaultSamplingMode ??
        DEFAULT_TRAJECTORY_TRACKING_CONFIG.defaultSamplingMode,
      defaultMaxSamples:
        config?.defaultMaxSamples ??
        DEFAULT_TRAJECTORY_TRACKING_CONFIG.defaultMaxSamples,
      defaultTimeWindowSec:
        config?.defaultTimeWindowSec ??
        DEFAULT_TRAJECTORY_TRACKING_CONFIG.defaultTimeWindowSec,
      defaultMinSampleDtSec:
        config?.defaultMinSampleDtSec ??
        DEFAULT_TRAJECTORY_TRACKING_CONFIG.defaultMinSampleDtSec,
      defaultMinDistance:
        config?.defaultMinDistance ??
        DEFAULT_TRAJECTORY_TRACKING_CONFIG.defaultMinDistance,
      entities: (config?.entities ?? []).map((entry) => ({
        ...entry,
      })),
    }
  }

  private resolveSamplingConfig(
    entityConfig?: EntityTrajectoryTrackingConfig,
  ): ResolvedTrajectorySamplingConfig {
    return {
      samplingMode: entityConfig?.samplingMode ?? this.config.defaultSamplingMode,
      maxSamples: entityConfig?.maxSamples ?? this.config.defaultMaxSamples,
      timeWindowSec:
        entityConfig?.timeWindowSec ?? this.config.defaultTimeWindowSec,
      minSampleDtSec:
        entityConfig?.minSampleDtSec ?? this.config.defaultMinSampleDtSec,
      minDistance: entityConfig?.minDistance ?? this.config.defaultMinDistance,
    }
  }

  private isEntityEnabled(entityConfig?: EntityTrajectoryTrackingConfig): boolean {
    if (entityConfig) return entityConfig.enabled ?? true
    return this.config.trackAllSupportedEntities
  }

  private resolveLatestSample(
    state: SimulationState,
    entityId: string,
  ): TrajectorySample2D | undefined {
    if (!state.trajectories.has(entityId)) {
      this.lastSampleByEntity.delete(entityId)
      return undefined
    }

    const cached = this.lastSampleByEntity.get(entityId)
    if (cached) return cached

    const latest = state.trajectories.get(entityId)?.samples.at(-1)
    if (latest) this.lastSampleByEntity.set(entityId, latest)
    return latest
  }

  private getEntityConfig(
    entityId: string,
  ): EntityTrajectoryTrackingConfig | undefined {
    return this.config.entities.find((entry) => entry.entityId === entityId)
  }

  private recordDecision(
    state: SimulationState,
    tick: number,
    timeSec: number,
    entityId: string,
    sampling: ResolvedTrajectorySamplingConfig,
    decision: TrajectoryDebugDecision,
    reason: string,
    pose?: { x: number; y: number; yaw?: number; speed?: number },
  ): void {
    const sampleCount = state.trajectories.get(entityId)?.samples.length ?? 0
    const record: TrajectoryDebugRecord = {
      tick,
      timeSec,
      entityId,
      x: pose?.x,
      y: pose?.y,
      yaw: pose?.yaw,
      speed: pose?.speed,
      decision,
      reason,
      sampleCount,
      samplingMode: sampling.samplingMode,
      maxSamples: sampling.maxSamples,
      timeWindowSec: sampling.timeWindowSec,
      minSampleDtSec: sampling.minSampleDtSec,
      minDistance: sampling.minDistance,
    }
    state.trajectoryDebug.record(record)
  }
}
