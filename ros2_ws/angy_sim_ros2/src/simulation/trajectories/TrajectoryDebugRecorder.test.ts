import { describe, expect, it } from 'vitest'
import { TrajectoryDebugRecorder } from './TrajectoryDebugRecorder'

describe('TrajectoryDebugRecorder', () => {
  it('does not record while disabled', () => {
    const recorder = new TrajectoryDebugRecorder()
    recorder.record({
      tick: 1,
      timeSec: 0.1,
      entityId: 'ego',
      decision: 'appended',
      sampleCount: 1,
      samplingMode: 'pointCount',
      maxSamples: 500,
      minSampleDtSec: 0,
      minDistance: 0,
    })
    expect(recorder.getRecords()).toEqual([])
  })

  it('records while enabled and returns snapshots', () => {
    const recorder = new TrajectoryDebugRecorder()
    recorder.setEnabled(true)
    recorder.record({
      tick: 1,
      timeSec: 0.1,
      entityId: 'ego',
      x: 1,
      y: 2,
      decision: 'appended',
      sampleCount: 1,
      samplingMode: 'pointCount',
      maxSamples: 500,
      minSampleDtSec: 0,
      minDistance: 0,
    })
    const records = recorder.getRecords()
    expect(records).toHaveLength(1)
    records[0].entityId = 'mutated'
    expect(recorder.getRecords()[0].entityId).toBe('ego')
  })
})
