import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulationEngine } from './SimulationEngine'
import { SimulationRecorderSystem } from '../recording/SimulationRecorderSystem'
import { REPLAY_FORMAT_TAG, REPLAY_FORMAT_VERSION } from '../recording/ReplayFormat'
import { VehicleEntity } from '../entities/VehicleEntity'
import { Pose2D } from '../../math/geometry/Pose2D'

describe('SimulationEngine — recording integration', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
    engine.addSystem(new SimulationRecorderSystem(engine.recorder))
    engine.addEntity(new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) }))
  })

  it('exposes the recorder, defaulting to disabled', () => {
    expect(engine.recorder).toBeDefined()
    expect(engine.getRecordingConfig().enabled).toBe(false)
    expect(engine.getRecordingStatus().recording).toBe(false)
  })

  it('startRecording requires enabled config (no-op + no event otherwise)', () => {
    const onStart = vi.fn()
    engine.events.on('recordingStarted', onStart)
    engine.startRecording()
    expect(engine.getRecordingStatus().recording).toBe(false)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('startRecording emits recordingStarted only on a real transition', () => {
    engine.setRecordingConfig({ enabled: true })
    const onStart = vi.fn()
    engine.events.on('recordingStarted', onStart)
    engine.startRecording()
    engine.startRecording()
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart).toHaveBeenCalledWith({ config: engine.getRecordingConfig() })
  })

  it('captures one frame per step at default cadence', () => {
    engine.setRecordingConfig({ enabled: true, maxFrames: 100 })
    engine.startRecording()
    engine.step()
    engine.step()
    engine.step()
    expect(engine.getRecordingStatus().frameCount).toBe(3)
  })

  it('captured frame ticks match the tick event payload', () => {
    engine.setRecordingConfig({ enabled: true, maxFrames: 10 })
    engine.startRecording()
    const tickPayloads: number[] = []
    engine.events.on('tick', (p) => tickPayloads.push(p.ticks))
    engine.step()
    engine.step()
    const frames = engine.recorder.getFrames()
    expect(frames.map((f) => f.tick)).toEqual(tickPayloads)
  })

  it('stopRecording emits recordingStopped(reason=manual) only on transition', () => {
    engine.setRecordingConfig({ enabled: true })
    engine.startRecording()
    const onStop = vi.fn()
    engine.events.on('recordingStopped', onStop)
    engine.step()
    engine.stopRecording()
    engine.stopRecording()
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledWith({
      frameCount: 1,
      reason: 'manual',
    })
  })

  it('clearRecording empties frames and emits recordingCleared', () => {
    engine.setRecordingConfig({ enabled: true })
    engine.startRecording()
    engine.step()
    const onClear = vi.fn()
    engine.events.on('recordingCleared', onClear)
    engine.clearRecording()
    expect(engine.getRecordingStatus().frameCount).toBe(0)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('reset() stops recording and clears frames; emits recordingStopped(reset)', () => {
    engine.setRecordingConfig({ enabled: true })
    engine.startRecording()
    engine.step()
    const onStop = vi.fn()
    engine.events.on('recordingStopped', onStop)
    engine.reset()
    expect(engine.getRecordingStatus().frameCount).toBe(0)
    expect(engine.getRecordingStatus().recording).toBe(false)
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'reset' }),
    )
  })

  it('reset() does NOT emit recordingStopped if not recording', () => {
    const onStop = vi.fn()
    engine.events.on('recordingStopped', onStop)
    engine.reset()
    expect(onStop).not.toHaveBeenCalled()
  })

  it('exportRecording returns a versioned envelope using engine fixedDt', () => {
    engine.setRecordingConfig({ enabled: true })
    engine.startRecording()
    engine.step()
    engine.step()
    const file = engine.exportRecording()
    expect(file.format).toBe(REPLAY_FORMAT_TAG)
    expect(file.version).toBe(REPLAY_FORMAT_VERSION)
    expect(file.fixedDtSec).toBe(engine.getFixedDt())
    expect(file.frames).toHaveLength(2)
  })

  it('exportRecording includes scenario name when one is loaded', () => {
    engine.loadScenario({ name: 'demo', entities: [] })
    engine.addEntity(new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) }))
    engine.setRecordingConfig({ enabled: true })
    engine.startRecording()
    engine.step()
    const file = engine.exportRecording()
    expect(file.scenarioName).toBe('demo')
  })

  it('loadScenario clears recording state via reset', () => {
    engine.setRecordingConfig({ enabled: true })
    engine.startRecording()
    engine.step()
    engine.loadScenario({ name: 's', entities: [] })
    expect(engine.getRecordingStatus().frameCount).toBe(0)
    expect(engine.getRecordingStatus().recording).toBe(false)
  })
})
