import { Logger } from '../logging/Logger'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import type { Entity } from '../entities/Entity'
import type { SimulationSystem } from '../systems/SimulationSystem'
import type { ScenarioSpec } from '../scenarios/Scenario'
import type { TrajectoryTrackingConfig } from '../trajectories/TrajectoryTrackingConfig'
import type { TrajectoryDebugRecord } from '../trajectories/TrajectoryDebugRecord'
import { ScenarioLoader } from '../scenarios/ScenarioLoader'
import {
  SimulationRecorder,
  type SimulationRecorderConfig,
  type SimulationRecorderStatus,
} from '../recording/SimulationRecorder'
import type { ReplayFileFormat } from '../recording/ReplayFormat'
import {
  SimulationProfiler,
  type NowMsFn,
} from '../profiling/SimulationProfiler'
import type { ProfilerSnapshot } from '../profiling/ProfilerTypes'

import { EntityManager } from './EntityManager'
import { SystemManager } from './SystemManager'
import { SimulationClock } from './SimulationClock'
import { SimulationLoop } from './SimulationLoop'
import { SimulationState } from './SimulationState'

export interface SimulationEngineOptions {
  fixedDtSec?: number
  logger?: Logger
  /**
   * Wall-clock source for the engine tick profiler. Injectable so
   * tests can feed deterministic sequences and non-browser hosts can
   * bring their own clock. Defaults to `performance.now()` when
   * available, else `Date.now()`. Never used for simulation time.
   */
  nowMs?: NowMsFn
  /** Size of the profiler's rolling sample window. */
  profilerHistoryCapacity?: number
  /** Start the profiler disabled (collection off). Defaults to `true`. */
  profilerEnabled?: boolean
}

/**
 * Top-level orchestrator. Owns the clock, entity manager, system
 * manager, event bus, logger, and loop. Public surface is
 * deliberately small: start / pause / reset / step / loadScenario
 * (plus add/remove helpers). Consumers wanting more should reach
 * through `engine.systems`, `engine.entities`, or `engine.events`.
 */
export class SimulationEngine {
  readonly clock: SimulationClock
  readonly entities: EntityManager
  readonly systems: SystemManager
  readonly events: TypedEventBus<SimulationEvents>
  readonly logger: Logger
  readonly state: SimulationState
  readonly recorder: SimulationRecorder
  readonly profiler: SimulationProfiler
  private loop: SimulationLoop

  constructor(options: SimulationEngineOptions = {}) {
    this.clock = new SimulationClock()
    this.entities = new EntityManager()
    this.systems = new SystemManager()
    this.events = new TypedEventBus<SimulationEvents>()
    this.logger = options.logger ?? new Logger()
    this.state = new SimulationState(
      this.clock,
      this.entities,
      this.events,
      this.logger,
    )
    this.recorder = new SimulationRecorder()
    this.profiler = new SimulationProfiler({
      nowMs: options.nowMs,
      historyCapacity: options.profilerHistoryCapacity,
      enabled: options.profilerEnabled ?? true,
    })
    this.loop = new SimulationLoop({ fixedDtSec: options.fixedDtSec ?? 1 / 60 })
    this.loop.setStepCallback((dt) => this.tick(dt))
  }

  /* -- lifecycle ------------------------------------------------------- */

  start(): void {
    if (this.loop.isRunning()) return
    this.loop.start()
    this.events.emit('started', undefined)
  }

  pause(): void {
    if (!this.loop.isRunning()) return
    this.loop.pause()
    this.events.emit('paused', undefined)
  }

  /** Manually advance one step. Ignored while the timer-driven loop runs. */
  step(dt?: number): void {
    if (this.loop.isRunning()) {
      this.logger.warn('SimulationEngine.step ignored: loop is running')
      return
    }
    this.tick(dt ?? this.loop.getFixedDt())
  }

  reset(): void {
    this.loop.pause()
    this.clock.reset()
    this.entities.clear()
    this.state.resetMetrics()
    this.state.paths.clear()
    this.state.poseArrays.clear()
    this.state.trajectories.clear()
    this.state.lidarScans.clear()
    this.state.scenarioName = null
    this.systems.reset()
    this.profiler.clear()
    const wasRecording = this.recorder.isRecording()
    const frameCount = this.recorder.getStatus().frameCount
    this.recorder.stop()
    this.recorder.clear()
    if (wasRecording) {
      this.events.emit('recordingStopped', {
        frameCount,
        reason: 'reset',
      })
    }
    this.events.emit('reset', undefined)
  }

  /* -- scenario -------------------------------------------------------- */

  loadScenario(spec: ScenarioSpec): void {
    this.reset()
    for (const entitySpec of spec.entities) {
      const entity = ScenarioLoader.buildEntity(entitySpec)
      this.entities.add(entity)
      this.events.emit('entityAdded', { id: entity.id })
    }
    for (const pathSpec of spec.paths ?? []) {
      this.state.paths.add({
        id: pathSpec.id,
        name: pathSpec.name,
        frameId: pathSpec.frameId,
        vehicleId: pathSpec.vehicleId,
        points: pathSpec.points,
      })
    }
    this.state.scenarioName = spec.name
    this.applyTrajectoryTrackingFromScenario(spec)
    this.applyLidarSensorsFromScenario(spec)
    this.events.emit('scenarioLoaded', {
      name: spec.name,
      trajectoryTracking: spec.trajectoryTracking,
    })
  }

  /** Clear simulation-owned trajectory buffers (optional per-entity). */
  clearTrajectories(entityId?: string): void {
    this.state.trajectories.clear(entityId)
  }

  setTrajectoryDebugEnabled(enabled: boolean): void {
    this.state.trajectoryDebug.setEnabled(enabled)
  }

  isTrajectoryDebugEnabled(): boolean {
    return this.state.trajectoryDebug.isEnabled()
  }

  clearTrajectoryDebugRecords(): void {
    this.state.trajectoryDebug.clear()
  }

  getTrajectoryDebugRecords(): TrajectoryDebugRecord[] {
    return this.state.trajectoryDebug.getRecords()
  }

  /* -- recording ------------------------------------------------------- */

  /**
   * Update recorder configuration. Idempotent. Setting `enabled=false`
   * via this method also stops an in-progress recording (the recorder
   * enforces this internally).
   */
  setRecordingConfig(config: Partial<SimulationRecorderConfig>): void {
    this.recorder.setConfig(config)
  }

  getRecordingConfig(): SimulationRecorderConfig {
    return this.recorder.getConfig()
  }

  getRecordingStatus(): SimulationRecorderStatus {
    return this.recorder.getStatus()
  }

  /** Convenience accessor — equivalent to `getRecordingStatus().recording`. */
  isRecording(): boolean {
    return this.recorder.isRecording()
  }

  /** Convenience accessor — equivalent to `getRecordingStatus().frameCount`. */
  getRecordingFrameCount(): number {
    return this.recorder.getStatus().frameCount
  }

  /**
   * Begin recording subsequent ticks. No-op if the recorder is
   * disabled by config or already at `maxFrames`. Emits
   * `recordingStarted` only on a real off→on transition.
   */
  startRecording(): void {
    const wasRecording = this.recorder.isRecording()
    this.recorder.start()
    if (!wasRecording && this.recorder.isRecording()) {
      this.events.emit('recordingStarted', {
        config: this.recorder.getConfig(),
      })
    }
  }

  /**
   * Stop recording but keep the captured frames in memory (so they
   * remain available for export). Emits `recordingStopped` only on a
   * real on→off transition.
   */
  stopRecording(): void {
    const wasRecording = this.recorder.isRecording()
    if (!wasRecording) return
    const frameCount = this.recorder.getStatus().frameCount
    this.recorder.stop()
    this.events.emit('recordingStopped', {
      frameCount,
      reason: 'manual',
    })
  }

  /** Drop all buffered frames. Does not change recording state. */
  clearRecording(): void {
    this.recorder.clear()
    this.events.emit('recordingCleared', undefined)
  }

  /**
   * Build an exportable {@link ReplayFileFormat} envelope from the
   * current frame buffer. The engine fills in `fixedDtSec` and
   * `scenarioName`; callers may override or extend via `metadata`.
   */
  exportRecording(params?: {
    metadata?: Record<string, unknown>
    scenarioDescription?: string
    createdAt?: string
  }): ReplayFileFormat {
    return this.recorder.toReplayFile({
      scenarioName: this.state.scenarioName ?? undefined,
      scenarioDescription: params?.scenarioDescription,
      fixedDtSec: this.getFixedDt(),
      metadata: params?.metadata,
      createdAt: params?.createdAt,
    })
  }

  /* -- entity helpers -------------------------------------------------- */

  addEntity(entity: Entity): void {
    this.entities.add(entity)
    this.events.emit('entityAdded', { id: entity.id })
  }

  removeEntity(id: string): boolean {
    if (this.entities.remove(id)) {
      this.events.emit('entityRemoved', { id })
      return true
    }
    return false
  }

  /* -- system helpers -------------------------------------------------- */

  addSystem(system: SimulationSystem): void {
    this.systems.add(system)
  }

  /* -- introspection --------------------------------------------------- */

  isRunning(): boolean {
    return this.loop.isRunning()
  }

  getFixedDt(): number {
    return this.loop.getFixedDt()
  }

  setSpeedFactor(factor: number): void {
    this.loop.setSpeedFactor(factor)
  }

  /* -- profiler -------------------------------------------------------- */

  /** Convenience accessor; equivalent to `engine.profiler.getSnapshot()`. */
  getProfilerSnapshot(): ProfilerSnapshot {
    return this.profiler.getSnapshot()
  }

  /**
   * Pushes scenario trajectory settings onto `TrajectoryTrackingSystem`
   * when that system is registered under the name `trajectoryTracking`.
   */
  private applyTrajectoryTrackingFromScenario(spec: ScenarioSpec): void {
    const sys = this.systems.get('trajectoryTracking') as
      | { setConfig?: (c?: TrajectoryTrackingConfig) => void }
      | undefined
    sys?.setConfig?.(spec.trajectoryTracking)
  }

  /**
   * Forwards scenario sensor specs to `LidarSensorSystem` when that
   * system is registered under the name `'lidarSensor'`.
   */
  private applyLidarSensorsFromScenario(spec: ScenarioSpec): void {
    const sys = this.systems.get('lidarSensor') as
      | { loadSpecs?: (s: ScenarioSpec['sensors']) => void }
      | undefined
    sys?.loadSpecs?.(spec.sensors ?? [])
  }

  /* -- internals ------------------------------------------------------- */

  private tick(dt: number): void {
    this.clock.tick(dt)

    // Profiler instrumentation is diagnostic-only: it observes
    // wall-clock durations but never mutates state, entities, or dt.
    // When the profiler is disabled, `getSystemInstrument()` returns
    // `undefined`, and `SystemManager.update` follows the original
    // zero-overhead iteration path.
    this.profiler.beginTick()
    this.systems.update(dt, this.state, this.profiler.getSystemInstrument())
    this.state.metrics.ticks += 1
    const sample = this.profiler.endTick({
      tickIndex: this.state.metrics.ticks,
      simDtSec: dt,
    })

    this.events.emit('tick', {
      time: this.clock.time(),
      dt,
      ticks: this.state.metrics.ticks,
    })
    if (sample) {
      this.events.emit('profileSample', sample)
    }
  }
}
