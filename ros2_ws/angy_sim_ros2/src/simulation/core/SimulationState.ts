import { EntityManager } from './EntityManager'
import { SimulationClock } from './SimulationClock'
import { PathRegistry } from '../paths/PathRegistry'
import { PoseArrayRegistry } from '../poses/PoseArrayRegistry'
import { TrajectoryRegistry } from '../trajectories/TrajectoryRegistry'
import { TrajectoryDebugRecorder } from '../trajectories/TrajectoryDebugRecorder'
import { LidarScanRegistry } from '../sensors/LidarScanRegistry'
import type { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import type { Logger } from '../logging/Logger'

/**
 * Aggregated runtime metrics. Systems mutate this object directly.
 * Anything derived (averages, etc.) should be computed at read-time
 * by the UI to keep the per-tick cost small.
 */
export interface MetricsState {
  collisionCount: number
  totalDistance: number
  peakSpeed: number
  ticks: number
}

/**
 * The "world" passed to every system update. Centralizes everything
 * a system might want to read or write: entities, clock, metrics,
 * event bus, logger, current scenario name, planned/reference paths,
 * and runtime trajectory samples.
 */
export class SimulationState {
  readonly clock: SimulationClock
  readonly entities: EntityManager
  readonly metrics: MetricsState
  readonly events: TypedEventBus<SimulationEvents>
  readonly logger: Logger
  readonly paths: PathRegistry
  readonly poseArrays: PoseArrayRegistry
  readonly trajectories: TrajectoryRegistry
  readonly trajectoryDebug: TrajectoryDebugRecorder
  readonly lidarScans: LidarScanRegistry
  scenarioName: string | null

  constructor(
    clock: SimulationClock,
    entities: EntityManager,
    events: TypedEventBus<SimulationEvents>,
    logger: Logger,
  ) {
    this.clock = clock
    this.entities = entities
    this.events = events
    this.logger = logger
    this.paths = new PathRegistry()
    this.poseArrays = new PoseArrayRegistry()
    this.trajectories = new TrajectoryRegistry()
    this.trajectoryDebug = new TrajectoryDebugRecorder()
    this.lidarScans = new LidarScanRegistry()
    this.metrics = {
      collisionCount: 0,
      totalDistance: 0,
      peakSpeed: 0,
      ticks: 0,
    }
    this.scenarioName = null
  }

  resetMetrics(): void {
    this.metrics.collisionCount = 0
    this.metrics.totalDistance = 0
    this.metrics.peakSpeed = 0
    this.metrics.ticks = 0
  }
}
