import { beforeEach, describe, expect, it } from 'vitest'
import { SimulationController } from './SimulationController'
import { SimulationEngine } from './SimulationEngine'
import { VehicleDynamicsSystem } from '../systems/VehicleDynamicsSystem'
import { TrajectoryTrackingSystem } from '../systems/TrajectoryTrackingSystem'

describe('SimulationEngine — trajectory integration', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
  })

  it('state.trajectories starts empty', () => {
    expect(engine.state.trajectories.size()).toBe(0)
  })

  it('reset clears trajectories', () => {
    engine.state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    engine.reset()
    expect(engine.state.trajectories.size()).toBe(0)
  })

  it('loadScenario clears old trajectories', () => {
    engine.state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    engine.loadScenario({ name: 's', entities: [] })
    expect(engine.state.trajectories.size()).toBe(0)
  })

  it('clearTrajectories clears one entity or all', () => {
    engine.state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    engine.state.trajectories.append('actor', { timeSec: 0, x: 1, y: 0 }, 10)
    engine.clearTrajectories('ego')
    expect(engine.state.trajectories.has('ego')).toBe(false)
    expect(engine.state.trajectories.has('actor')).toBe(true)
    engine.clearTrajectories()
    expect(engine.state.trajectories.size()).toBe(0)
  })

  it('applies scenario trajectoryTracking config to registered system', () => {
    const tracking = new TrajectoryTrackingSystem()
    engine.addSystem(new VehicleDynamicsSystem())
    engine.addSystem(tracking)

    engine.loadScenario({
      name: 'cfg',
      entities: [],
      trajectoryTracking: {
        enabled: true,
        trackAllSupportedEntities: true,
        defaultSamplingMode: 'timeWindow',
        defaultTimeWindowSec: 3,
      },
    })

    expect(tracking.getConfig().enabled).toBe(true)
    expect(tracking.getConfig().trackAllSupportedEntities).toBe(true)
    expect(tracking.getConfig().defaultSamplingMode).toBe('timeWindow')
    expect(tracking.getConfig().defaultTimeWindowSec).toBe(3)
  })

  it('produces trajectory samples after several ticks when dynamics precedes tracking', () => {
    const tracking = new TrajectoryTrackingSystem()
    engine.addSystem(new VehicleDynamicsSystem())
    engine.addSystem(tracking)

    engine.loadScenario({
      name: 'moving',
      entities: [
        {
          kind: 'vehicle',
          id: 'ego',
          pose: { x: 0, y: 0, yaw: 0 },
          controls: { v: 1, w: 0.1 },
        },
      ],
      trajectoryTracking: {
        enabled: true,
        trackAllSupportedEntities: true,
        defaultMinSampleDtSec: 0,
        defaultMinDistance: 0,
      },
    })

    engine.step(0.1)
    engine.step(0.1)
    engine.step(0.1)

    const trajectory = engine.state.trajectories.get('ego')
    expect(trajectory).toBeDefined()
    expect(trajectory?.samples.length).toBeGreaterThanOrEqual(3)
  })
})

describe('SimulationController — trajectory integration', () => {
  it('clearTrajectories delegates to engine', () => {
    const engine = new SimulationEngine()
    const controller = new SimulationController(engine)
    engine.state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    controller.clearTrajectories('ego')
    expect(engine.state.trajectories.has('ego')).toBe(false)
  })
})
