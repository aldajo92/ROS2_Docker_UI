import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from '../systems/SimulationSystem'
import { createSnapshotFromState } from './createSnapshotFromState'
import type { SimulationRecorder } from './SimulationRecorder'

/**
 * The simulation system that ferries snapshots into the recorder.
 *
 * Run order matters: this system MUST be registered AFTER any system
 * that mutates entity pose/velocity for the current tick (vehicle
 * dynamics, dynamic actor integration, command application) and
 * AFTER `MetricsSystem`, so the captured frame reflects the final
 * post-tick state. Convention in `SimulationProvider` is to register
 * it last in the pipeline.
 *
 * Responsibilities:
 * - Honor `recorder.config.sampleEveryNTicks` cadence.
 * - Snapshot via `createSnapshotFromState` (read-only).
 * - Append to the recorder; if that flips recording off due to
 *   `maxFrames`, emit `recordingMaxFramesReached` exactly once.
 *
 * Non-responsibilities:
 * - Does NOT touch DOM, filesystem, or network.
 * - Does NOT mutate entities or any other simulation state.
 * - Does NOT decide *what* to record — that is the snapshot fn.
 */
export class SimulationRecorderSystem implements SimulationSystem {
  readonly name = 'simulationRecorder'
  private readonly recorder: SimulationRecorder
  private invocationCount = 0

  constructor(recorder: SimulationRecorder) {
    this.recorder = recorder
  }

  update(_dt: number, state: SimulationState): void {
    if (!this.recorder.isRecording()) return

    this.invocationCount += 1
    const cadence = this.recorder.getConfig().sampleEveryNTicks
    if (cadence > 1 && this.invocationCount % cadence !== 1) return

    const snapshot = createSnapshotFromState(state)
    this.recorder.append(snapshot)

    // Append may flip recording off when the buffer fills. Surface
    // that as both a "max reached" notice (Phase 2 UI) and a
    // canonical `recordingStopped` event (parity with manual stops).
    if (!this.recorder.isRecording()) {
      const status = this.recorder.getStatus()
      state.events.emit('recordingMaxFramesReached', {
        frameCount: status.frameCount,
      })
      state.events.emit('recordingStopped', {
        frameCount: status.frameCount,
        reason: 'maxFramesReached',
      })
    }
  }

  reset(): void {
    this.invocationCount = 0
  }
}
