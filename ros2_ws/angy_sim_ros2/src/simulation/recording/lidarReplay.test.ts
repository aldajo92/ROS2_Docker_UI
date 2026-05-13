import { describe, it, expect } from 'vitest'
import { createSnapshotFromState } from './createSnapshotFromState'
import { createReplayStateFromFrame } from './createReplayStateFromFrame'
import { SimulationEngine } from '../core/SimulationEngine'
import { LidarSensorSystem } from '../systems/LidarSensorSystem'
import type { LidarScan2D } from '../sensors/LidarScan2D'

function makeScan(id: string, ranges: number[], worldPose?: { x: number; y: number; yaw: number }): LidarScan2D {
  return {
    id,
    sensorId: id,
    timeSec: 1.0,
    angleMin: -Math.PI / 2,
    angleMax: Math.PI / 2,
    angleIncrement: Math.PI / (ranges.length - 1),
    rangeMin: 0.05,
    rangeMax: 8,
    ranges,
    ...(worldPose !== undefined
      ? { originX: worldPose.x, originY: worldPose.y, worldYaw: worldPose.yaw }
      : {}),
  }
}

describe('lidar snapshot / replay', () => {
  it('createSnapshotFromState omits lidarScans when registry is empty', () => {
    const engine = new SimulationEngine()
    engine.loadScenario({ name: 'test', entities: [] })
    engine.step(1 / 60)
    const snap = createSnapshotFromState(engine.state)
    expect(snap.lidarScans).toBeUndefined()
  })

  it('createSnapshotFromState includes lidarScans when present', () => {
    const engine = new SimulationEngine()
    engine.systems.add(new LidarSensorSystem())
    engine.loadScenario({
      name: 'test',
      entities: [],
      sensors: [{
        kind: 'lidar2d', id: 'front',
        angleMin: -Math.PI / 2, angleMax: Math.PI / 2,
        rayCount: 5, rangeMin: 0.05, rangeMax: 8, rateHz: 10,
      }],
    })
    engine.step(0.1)
    const snap = createSnapshotFromState(engine.state)
    expect(snap.lidarScans).toBeDefined()
    expect(snap.lidarScans!.length).toBe(1)
    expect(snap.lidarScans![0].sensorId).toBe('front')
  })

  it('createReplayStateFromFrame restores lidar scans exactly', () => {
    const scan = makeScan('s1', [1.1, 2.2, 3.3, 4.4, 5.5])
    const frame = {
      tick: 10,
      timeSec: 1.0,
      entities: [],
      lidarScans: [scan],
    }
    const state = createReplayStateFromFrame(frame, 1 / 60)
    expect(state.lidarScans.size()).toBe(1)
    const restored = state.lidarScans.get('s1')!
    expect(restored.ranges).toEqual([1.1, 2.2, 3.3, 4.4, 5.5])
  })

  it('createReplayStateFromFrame works when lidarScans is absent (old format)', () => {
    const frame = {
      tick: 1,
      timeSec: 0,
      entities: [],
      // no lidarScans field
    }
    const state = createReplayStateFromFrame(frame, 1 / 60)
    expect(state.lidarScans.size()).toBe(0)
  })

  it('createReplayStateFromFrame round-trips world-space pose fields', () => {
    const scan = makeScan('s1', [1.0, 2.0, 3.0], { x: 2.3, y: 3.0, yaw: 0.5 })
    const frame = { tick: 5, timeSec: 0.5, entities: [], lidarScans: [scan] }
    const state = createReplayStateFromFrame(frame, 1 / 60)
    const restored = state.lidarScans.get('s1')!
    expect(restored.originX).toBe(2.3)
    expect(restored.originY).toBe(3.0)
    expect(restored.worldYaw).toBe(0.5)
  })

  it('createReplayStateFromFrame handles scan without world-pose fields (old format)', () => {
    const scan = makeScan('s2', [1.0, 2.0, 3.0]) // no worldPose
    const frame = { tick: 2, timeSec: 0.2, entities: [], lidarScans: [scan] }
    const state = createReplayStateFromFrame(frame, 1 / 60)
    const restored = state.lidarScans.get('s2')!
    expect(restored.originX).toBeUndefined()
    expect(restored.originY).toBeUndefined()
    expect(restored.worldYaw).toBeUndefined()
    expect(restored.ranges).toEqual([1.0, 2.0, 3.0])
  })
})
