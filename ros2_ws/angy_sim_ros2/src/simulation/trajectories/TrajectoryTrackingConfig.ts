export type TrajectorySamplingMode = 'pointCount' | 'timeWindow'

export type EntityTrajectoryTrackingConfig = {
  entityId: string
  enabled?: boolean
  samplingMode?: TrajectorySamplingMode
  maxSamples?: number
  timeWindowSec?: number
  minSampleDtSec?: number
  minDistance?: number
}

export type TrajectoryTrackingConfig = {
  enabled?: boolean
  trackAllSupportedEntities?: boolean

  defaultSamplingMode?: TrajectorySamplingMode
  defaultMaxSamples?: number
  defaultTimeWindowSec?: number
  defaultMinSampleDtSec?: number
  defaultMinDistance?: number

  entities?: EntityTrajectoryTrackingConfig[]
}

export const DEFAULT_TRAJECTORY_TRACKING_CONFIG = {
  enabled: false,
  trackAllSupportedEntities: false,
  defaultSamplingMode: 'pointCount',
  defaultMaxSamples: 500,
  defaultTimeWindowSec: 10,
  defaultMinSampleDtSec: 0,
  defaultMinDistance: 0,
  entities: [],
} satisfies Required<TrajectoryTrackingConfig>
