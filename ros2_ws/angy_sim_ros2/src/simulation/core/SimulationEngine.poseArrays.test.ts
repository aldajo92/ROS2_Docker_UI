import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from './SimulationEngine'
import type { PoseArray2D } from '../poses/PoseArray2D'

const samplePoseArray: PoseArray2D = {
  id: '/pose_array',
  frameId: 'map',
  poses: [
    { x: 0, y: 0, yaw: 0 },
    { x: 1, y: 0.5, yaw: 0.2 },
  ],
}

describe('SimulationEngine — poseArrays reset behavior', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
  })

  it('state.poseArrays is empty on construction', () => {
    expect(engine.state.poseArrays.size()).toBe(0)
  })

  it('reset clears state.poseArrays', () => {
    engine.state.poseArrays.upsert(samplePoseArray)
    expect(engine.state.poseArrays.size()).toBe(1)

    engine.reset()

    expect(engine.state.poseArrays.size()).toBe(0)
    expect(engine.state.poseArrays.has('/pose_array')).toBe(false)
  })
})
