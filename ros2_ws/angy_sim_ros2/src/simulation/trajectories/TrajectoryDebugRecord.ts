export type TrajectoryDebugDecision =
  | 'appended'
  | 'skipped_disabled'
  | 'skipped_missing_entity'
  | 'skipped_unsupported_entity'
  | 'skipped_min_sample_dt'
  | 'skipped_min_distance'
  | 'skipped_unknown'

export type TrajectoryDebugRecord = {
  tick: number
  timeSec: number

  entityId: string

  x?: number
  y?: number
  yaw?: number
  speed?: number

  decision: TrajectoryDebugDecision
  reason?: string

  sampleCount: number

  samplingMode: 'pointCount' | 'timeWindow'
  maxSamples: number
  timeWindowSec?: number
  minSampleDtSec: number
  minDistance: number
}
