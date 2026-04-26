import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from './SimulationEngine'
import type { ScenarioSpec } from '../scenarios/Scenario'

const minimalScenario: ScenarioSpec = {
  name: 'base',
  entities: [],
}

const scenarioWithPaths: ScenarioSpec = {
  name: 'path-scenario',
  entities: [],
  paths: [
    {
      id: 'ref-path',
      name: 'Reference',
      vehicleId: 'ego',
      frameId: 'map',
      points: [
        { x: 0, y: 0, yaw: 0, targetVelocity: 1.0 },
        { x: 2, y: 0, yaw: 0, targetVelocity: 1.0 },
        { x: 4, y: 1, yaw: 0.3, targetVelocity: 0.8 },
      ],
    },
    {
      id: 'alt-path',
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    },
  ],
}

describe('SimulationEngine — path integration', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
  })

  it('state.paths is empty on construction', () => {
    expect(engine.state.paths.size()).toBe(0)
  })

  it('loadScenario populates state.paths', () => {
    engine.loadScenario(scenarioWithPaths)
    expect(engine.state.paths.size()).toBe(2)
    expect(engine.state.paths.has('ref-path')).toBe(true)
    expect(engine.state.paths.has('alt-path')).toBe(true)
  })

  it('loaded path preserves points', () => {
    engine.loadScenario(scenarioWithPaths)
    const path = engine.state.paths.get('ref-path')!
    expect(path.points).toHaveLength(3)
    expect(path.points[2].yaw).toBeCloseTo(0.3)
    expect(path.points[2].targetVelocity).toBe(0.8)
    expect(path.vehicleId).toBe('ego')
    expect(path.frameId).toBe('map')
  })

  it('reset clears state.paths', () => {
    engine.loadScenario(scenarioWithPaths)
    engine.reset()
    expect(engine.state.paths.size()).toBe(0)
  })

  it('loading a second scenario replaces paths from the first', () => {
    engine.loadScenario(scenarioWithPaths)
    engine.loadScenario({
      name: 'second',
      entities: [],
      paths: [{ id: 'new-path', points: [{ x: 0, y: 0 }] }],
    })
    expect(engine.state.paths.size()).toBe(1)
    expect(engine.state.paths.has('new-path')).toBe(true)
    expect(engine.state.paths.has('ref-path')).toBe(false)
  })

  it('scenario without paths key leaves state.paths empty', () => {
    engine.loadScenario(minimalScenario)
    expect(engine.state.paths.size()).toBe(0)
  })
})
