import { beforeEach, describe, expect, it } from 'vitest'
import { Pose2D } from '../../math/geometry/Pose2D'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { BaseEntity } from '../entities/BaseEntity'
import { VehicleEntity } from '../entities/VehicleEntity'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { SimulationState } from '../core/SimulationState'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { TrajectoryTrackingSystem } from './TrajectoryTrackingSystem'

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
  system: TrajectoryTrackingSystem,
  dt: number,
): void {
  state.clock.tick(dt)
  system.update(dt, state)
}

describe('TrajectoryTrackingSystem', () => {
  let state: SimulationState
  let system: TrajectoryTrackingSystem
  let ego: VehicleEntity
  let actor: DynamicActorEntity

  beforeEach(() => {
    state = createState()
    system = new TrajectoryTrackingSystem()
    ego = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) })
    actor = new DynamicActorEntity({ id: 'actor', pose: Pose2D.of(5, 0, 0) })
    state.entities.add(ego)
    state.entities.add(actor)
  })

  it('does nothing when disabled', () => {
    tick(state, system, 0.1)
    expect(state.trajectories.size()).toBe(0)
  })

  it('tracks configured vehicle', () => {
    system.setConfig({
      enabled: true,
      trackAllSupportedEntities: false,
      entities: [{ entityId: 'ego' }],
    })
    tick(state, system, 0.1)
    expect(state.trajectories.has('ego')).toBe(true)
    expect(state.trajectories.has('actor')).toBe(false)
  })

  it('tracks configured dynamic actor', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'actor', enabled: true }],
    })
    tick(state, system, 0.1)
    expect(state.trajectories.has('actor')).toBe(true)
  })

  it('ignores unsupported entities', () => {
    class UnknownEntity extends BaseEntity {
      constructor(id: string) {
        super(id, 'unknown')
      }
    }
    state.entities.add(new UnknownEntity('u1'))
    system.setConfig({ enabled: true, trackAllSupportedEntities: true })
    tick(state, system, 0.1)
    expect(state.trajectories.has('u1')).toBe(false)
  })

  it('supports pointCount mode', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', samplingMode: 'pointCount', maxSamples: 2 }],
    })
    ego.pose = Pose2D.of(0, 0, 0)
    tick(state, system, 0.1)
    ego.pose = Pose2D.of(1, 0, 0)
    tick(state, system, 0.1)
    ego.pose = Pose2D.of(2, 0, 0)
    tick(state, system, 0.1)
    expect(state.trajectories.get('ego')?.samples.map((s) => s.x)).toEqual([1, 2])
  })

  it('supports timeWindow mode', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', samplingMode: 'timeWindow', timeWindowSec: 0.15 }],
    })
    ego.pose = Pose2D.of(0, 0, 0)
    tick(state, system, 0.1) // t=0.1
    ego.pose = Pose2D.of(1, 0, 0)
    tick(state, system, 0.1) // t=0.2
    ego.pose = Pose2D.of(2, 0, 0)
    tick(state, system, 0.1) // t=0.3 -> keeps >= 0.15
    expect(state.trajectories.get('ego')?.samples.map((s) => s.x)).toEqual([1, 2])
  })

  it('minSampleDtSec prevents oversampling', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', minSampleDtSec: 0.2 }],
    })
    tick(state, system, 0.1)
    tick(state, system, 0.05)
    expect(state.trajectories.get('ego')?.samples).toHaveLength(1)
  })

  it('minDistance prevents oversampling', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', minDistance: 1 }],
    })
    ego.pose = Pose2D.of(0, 0, 0)
    tick(state, system, 0.1)
    ego.pose = Pose2D.of(0.5, 0, 0)
    tick(state, system, 0.1)
    expect(state.trajectories.get('ego')?.samples).toHaveLength(1)
  })

  it('minDistance = 0 appends even when stopped', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', minDistance: 0 }],
    })
    tick(state, system, 0.1)
    tick(state, system, 0.1)
    tick(state, system, 0.1)
    expect(state.trajectories.get('ego')?.samples).toHaveLength(3)
  })

  it('trackAllSupportedEntities tracks supported entities', () => {
    system.setConfig({ enabled: true, trackAllSupportedEntities: true })
    tick(state, system, 0.1)
    expect(state.trajectories.has('ego')).toBe(true)
    expect(state.trajectories.has('actor')).toBe(true)
  })

  it('per-entity config overrides defaults', () => {
    system.setConfig({
      enabled: true,
      trackAllSupportedEntities: false,
      defaultMinDistance: 1,
      entities: [{ entityId: 'ego', minDistance: 0 }],
    })
    ego.pose = Pose2D.of(0, 0, 0)
    tick(state, system, 0.1)
    ego.pose = Pose2D.of(0.1, 0, 0)
    tick(state, system, 0.1)
    expect(state.trajectories.get('ego')?.samples).toHaveLength(2)
  })

  it('per-entity enabled false disables tracking with trackAll true', () => {
    system.setConfig({
      enabled: true,
      trackAllSupportedEntities: true,
      entities: [{ entityId: 'ego', enabled: false }],
    })
    tick(state, system, 0.1)
    expect(state.trajectories.has('ego')).toBe(false)
    expect(state.trajectories.has('actor')).toBe(true)
  })

  it('reset clears internal last-sample state', () => {
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', minSampleDtSec: 10 }],
    })
    tick(state, system, 0.1)
    state.trajectories.clear('ego')
    system.reset()
    tick(state, system, 0.1)
    expect(state.trajectories.get('ego')?.samples).toHaveLength(1)
  })

  it('writes debug decisions when recorder is enabled', () => {
    state.trajectoryDebug.setEnabled(true)
    system.setConfig({
      enabled: true,
      entities: [{ entityId: 'ego', minSampleDtSec: 10 }],
    })
    tick(state, system, 0.1)
    tick(state, system, 0.1)
    const records = state.trajectoryDebug.getRecords().filter((r) => r.entityId === 'ego')
    expect(records.some((r) => r.decision === 'appended')).toBe(true)
    expect(records.some((r) => r.decision === 'skipped_min_sample_dt')).toBe(true)
  })
})
