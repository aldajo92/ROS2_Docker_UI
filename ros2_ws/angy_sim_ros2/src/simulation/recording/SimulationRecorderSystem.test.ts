import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Pose2D } from '../../math/geometry/Pose2D'
import { VehicleEntity } from '../entities/VehicleEntity'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { SimulationState } from '../core/SimulationState'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { SimulationRecorder } from './SimulationRecorder'
import { SimulationRecorderSystem } from './SimulationRecorderSystem'

function createState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

function tick(
  state: SimulationState,
  system: SimulationRecorderSystem,
  dt = 0.1,
): void {
  state.clock.tick(dt)
  system.update(dt, state)
  state.metrics.ticks += 1
}

describe('SimulationRecorderSystem', () => {
  let state: SimulationState
  let recorder: SimulationRecorder
  let system: SimulationRecorderSystem

  beforeEach(() => {
    state = createState()
    state.entities.add(new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) }))
    recorder = new SimulationRecorder({ enabled: true, maxFrames: 10 })
    system = new SimulationRecorderSystem(recorder)
  })

  it('does nothing when recorder is not recording', () => {
    tick(state, system)
    expect(recorder.getStatus().frameCount).toBe(0)
  })

  it('appends one frame per tick at default cadence', () => {
    recorder.start()
    tick(state, system)
    tick(state, system)
    tick(state, system)
    expect(recorder.getStatus().frameCount).toBe(3)
  })

  it('honors sampleEveryNTicks cadence', () => {
    recorder.setConfig({ sampleEveryNTicks: 3 })
    recorder.start()
    for (let i = 0; i < 7; i++) tick(state, system)
    // invocations 1, 4, 7 → 3 frames
    expect(recorder.getStatus().frameCount).toBe(3)
  })

  it('captured frames carry the engine-aligned tick number', () => {
    recorder.start()
    tick(state, system)
    tick(state, system)
    const frames = recorder.getFrames()
    expect(frames[0].tick).toBe(1)
    expect(frames[1].tick).toBe(2)
  })

  it('emits recordingMaxFramesReached and recordingStopped on auto-stop', () => {
    recorder.setConfig({ maxFrames: 2 })
    recorder.start()
    const onMax = vi.fn()
    const onStop = vi.fn()
    state.events.on('recordingMaxFramesReached', onMax)
    state.events.on('recordingStopped', onStop)

    tick(state, system)
    tick(state, system)
    tick(state, system)

    expect(onMax).toHaveBeenCalledTimes(1)
    expect(onMax).toHaveBeenCalledWith({ frameCount: 2 })
    expect(onStop).toHaveBeenCalledTimes(1)
    expect(onStop).toHaveBeenCalledWith({
      frameCount: 2,
      reason: 'maxFramesReached',
    })
    expect(recorder.isRecording()).toBe(false)
  })

  it('reset() clears the cadence counter', () => {
    recorder.setConfig({ sampleEveryNTicks: 2 })
    recorder.start()
    tick(state, system) // inv 1 → sampled
    tick(state, system) // inv 2 → skipped
    expect(recorder.getStatus().frameCount).toBe(1)

    system.reset()
    tick(state, system) // inv 1 again → sampled
    expect(recorder.getStatus().frameCount).toBe(2)
  })

  it('does not mutate entities while sampling', () => {
    recorder.start()
    const ego = state.entities.get('ego') as VehicleEntity
    const beforeX = ego.pose.position.x
    tick(state, system)
    expect(ego.pose.position.x).toBe(beforeX)
  })
})
