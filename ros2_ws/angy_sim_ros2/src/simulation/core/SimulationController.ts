import type { SimulationEngine } from './SimulationEngine'
import { ScenarioLoader } from '../scenarios/ScenarioLoader'
import {
  DEFAULT_TRAJECTORY_TRACKING_CONFIG,
  type TrajectoryTrackingConfig,
} from '../trajectories/TrajectoryTrackingConfig'
import type { TrajectoryDebugRecord } from '../trajectories/TrajectoryDebugRecord'
import type {
  SimulationRecorderConfig,
  SimulationRecorderStatus,
} from '../recording/SimulationRecorder'
import type { ReplayFileFormat } from '../recording/ReplayFormat'
import type { ProfilerSnapshot } from '../profiling/ProfilerTypes'

/**
 * Thin facade over SimulationEngine for UI / external callers. Keeps
 * the engine's public API focused on simulation concerns and lifts
 * higher-level conveniences (URL / JSON loading) up to the boundary.
 */
export class SimulationController {
  private engine: SimulationEngine

  constructor(engine: SimulationEngine) {
    this.engine = engine
  }

  start(): void {
    this.engine.start()
  }

  pause(): void {
    this.engine.pause()
  }

  reset(): void {
    this.engine.reset()
  }

  step(dt?: number): void {
    this.engine.step(dt)
  }

  async loadScenarioFromUrl(url: string): Promise<void> {
    const spec = await ScenarioLoader.loadFromUrl(url)
    this.engine.loadScenario(spec)
  }

  loadScenarioFromJson(json: unknown): void {
    const spec = ScenarioLoader.parse(json)
    this.engine.loadScenario(spec)
  }

  isRunning(): boolean {
    return this.engine.isRunning()
  }

  getEngine(): SimulationEngine {
    return this.engine
  }

  clearTrajectories(entityId?: string): void {
    this.engine.clearTrajectories(entityId)
  }

  setTrajectoryDebugEnabled(enabled: boolean): void {
    this.engine.setTrajectoryDebugEnabled(enabled)
  }

  isTrajectoryDebugEnabled(): boolean {
    return this.engine.isTrajectoryDebugEnabled()
  }

  clearTrajectoryDebugRecords(): void {
    this.engine.clearTrajectoryDebugRecords()
  }

  getTrajectoryDebugRecords(): TrajectoryDebugRecord[] {
    return this.engine.getTrajectoryDebugRecords()
  }

  /** Updates the registered `TrajectoryTrackingSystem` when present. */
  setTrajectoryTrackingConfig(config: TrajectoryTrackingConfig): void {
    const sys = this.engine.systems.get('trajectoryTracking') as
      | { setConfig?: (c?: TrajectoryTrackingConfig) => void }
      | undefined
    sys?.setConfig?.(config)
  }

  /** Snapshot for Inspector UI; defaults when the system is absent. */
  getTrajectoryTrackingConfig(): TrajectoryTrackingConfig {
    const sys = this.engine.systems.get('trajectoryTracking') as
      | { getConfig?: () => TrajectoryTrackingConfig }
      | undefined
    return sys?.getConfig?.() ?? { ...DEFAULT_TRAJECTORY_TRACKING_CONFIG }
  }

  /* -- recording ------------------------------------------------------- */

  setRecordingConfig(config: Partial<SimulationRecorderConfig>): void {
    this.engine.setRecordingConfig(config)
  }

  getRecordingConfig(): SimulationRecorderConfig {
    return this.engine.getRecordingConfig()
  }

  getRecordingStatus(): SimulationRecorderStatus {
    return this.engine.getRecordingStatus()
  }

  isRecording(): boolean {
    return this.engine.isRecording()
  }

  getRecordingFrameCount(): number {
    return this.engine.getRecordingFrameCount()
  }

  startRecording(): void {
    this.engine.startRecording()
  }

  stopRecording(): void {
    this.engine.stopRecording()
  }

  clearRecording(): void {
    this.engine.clearRecording()
  }

  exportRecording(params?: {
    metadata?: Record<string, unknown>
    scenarioDescription?: string
    createdAt?: string
  }): ReplayFileFormat {
    return this.engine.exportRecording(params)
  }

  /* -- profiler -------------------------------------------------------- */

  /** Current wall-clock timing snapshot (diagnostic-only). */
  getProfilerSnapshot(): ProfilerSnapshot {
    return this.engine.getProfilerSnapshot()
  }

  isProfilerEnabled(): boolean {
    return this.engine.profiler.isEnabled()
  }

  setProfilerEnabled(enabled: boolean): void {
    this.engine.profiler.setEnabled(enabled)
  }
}
