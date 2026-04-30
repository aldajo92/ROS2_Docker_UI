import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SIMULATION_RECORDER_CONFIG,
  SimulationRecorder,
} from './SimulationRecorder'
import type { SimulationFrameSnapshot } from './SimulationFrameSnapshot'
import { REPLAY_FORMAT_TAG, REPLAY_FORMAT_VERSION } from './ReplayFormat'

function frame(tick: number, timeSec = tick * 0.1): SimulationFrameSnapshot {
  return {
    tick,
    timeSec,
    entities: [],
  }
}

describe('SimulationRecorder', () => {
  it('starts disabled with no frames and refuses to record', () => {
    const recorder = new SimulationRecorder()
    expect(recorder.isRecording()).toBe(false)
    expect(recorder.getStatus().frameCount).toBe(0)
    recorder.start()
    expect(recorder.isRecording()).toBe(false)
    recorder.append(frame(1))
    expect(recorder.getStatus().frameCount).toBe(0)
  })

  it('start() requires enabled=true to actually record', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 5 })
    recorder.start()
    expect(recorder.isRecording()).toBe(true)
    recorder.append(frame(1))
    recorder.append(frame(2))
    expect(recorder.getStatus().frameCount).toBe(2)
  })

  it('stop() halts recording but preserves frames', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 10 })
    recorder.start()
    recorder.append(frame(1))
    recorder.stop()
    recorder.append(frame(2))
    expect(recorder.isRecording()).toBe(false)
    expect(recorder.getStatus().frameCount).toBe(1)
  })

  it('clear() drops all frames and resets maxFramesReached', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 1 })
    recorder.start()
    recorder.append(frame(1))
    expect(recorder.getStatus().maxFramesReached).toBe(true)
    recorder.clear()
    expect(recorder.getStatus().frameCount).toBe(0)
    expect(recorder.getStatus().maxFramesReached).toBe(false)
  })

  it('maxFrames auto-stops recording at exactly the cap', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 3 })
    recorder.start()
    for (let i = 1; i <= 10; i++) recorder.append(frame(i))
    expect(recorder.getStatus().frameCount).toBe(3)
    expect(recorder.isRecording()).toBe(false)
    expect(recorder.getStatus().maxFramesReached).toBe(true)
  })

  it('refuses to start when buffer is already at the cap', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 1 })
    recorder.start()
    recorder.append(frame(1))
    recorder.start()
    expect(recorder.isRecording()).toBe(false)
    expect(recorder.getStatus().maxFramesReached).toBe(true)
  })

  it('disabling via setConfig stops an in-progress recording', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 5 })
    recorder.start()
    expect(recorder.isRecording()).toBe(true)
    recorder.setConfig({ enabled: false })
    expect(recorder.isRecording()).toBe(false)
  })

  it('sanitizes invalid config to safe defaults', () => {
    const recorder = new SimulationRecorder({
      enabled: true,
      maxFrames: -3,
      sampleEveryNTicks: 0,
    })
    const cfg = recorder.getConfig()
    expect(cfg.maxFrames).toBeGreaterThanOrEqual(1)
    expect(cfg.sampleEveryNTicks).toBeGreaterThanOrEqual(1)
  })

  it('toReplayFile() builds a versioned envelope with cloned frames', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 5 })
    recorder.start()
    recorder.append(frame(1))
    recorder.append(frame(2))
    const file = recorder.toReplayFile({
      scenarioName: 'demo',
      fixedDtSec: 1 / 60,
    })
    expect(file.format).toBe(REPLAY_FORMAT_TAG)
    expect(file.version).toBe(REPLAY_FORMAT_VERSION)
    expect(file.scenarioName).toBe('demo')
    expect(file.fixedDtSec).toBeCloseTo(1 / 60)
    expect(file.frames).toHaveLength(2)

    file.frames[0].tick = 999
    expect(recorder.getFrames()[0].tick).toBe(1)
  })

  it('toReplayFile() round-trips through JSON without losing data', () => {
    const recorder = new SimulationRecorder({ enabled: true, maxFrames: 10 })
    recorder.start()
    recorder.append(frame(1))
    recorder.append(frame(2))
    const file = recorder.toReplayFile({ fixedDtSec: 0.05 })
    const reparsed = JSON.parse(JSON.stringify(file))
    expect(reparsed).toEqual(file)
  })

  it('default config matches the exported constant', () => {
    const recorder = new SimulationRecorder()
    expect(recorder.getConfig()).toEqual(DEFAULT_SIMULATION_RECORDER_CONFIG)
  })
})
