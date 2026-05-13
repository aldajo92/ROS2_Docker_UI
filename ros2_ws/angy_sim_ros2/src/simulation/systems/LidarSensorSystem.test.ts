import { describe, it, expect } from 'vitest'
import { LidarSensorSystem } from './LidarSensorSystem'
import { SimulationEngine } from '../core/SimulationEngine'
import type { LidarSensorSpec } from '../sensors/LidarSensorSpec'
import { ScenarioLoader } from '../scenarios/ScenarioLoader'
import type { ScenarioSpec } from '../scenarios/Scenario'

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function minimalSpec(overrides: Partial<LidarSensorSpec> = {}): LidarSensorSpec {
  return {
    kind: 'lidar2d',
    id: 'lidar_front',
    angleMin: -Math.PI / 2,
    angleMax: Math.PI / 2,
    rayCount: 5,
    rangeMin: 0.05,
    rangeMax: 8,
    rateHz: 10,
    ...overrides,
  }
}

function makeEngine(): SimulationEngine {
  const engine = new SimulationEngine()
  engine.systems.add(new LidarSensorSystem())
  return engine
}

const DT = 0.1 // matches 10 Hz period

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('LidarSensorSystem', () => {
  it('produces no scan before a scenario is loaded', () => {
    const engine = makeEngine()
    engine.start()
    engine.step(DT)
    engine.pause()
    expect(engine.state.lidarScans.size()).toBe(0)
  })

  it('produces a scan after one tick at 10 Hz with dt=0.1', () => {
    const engine = makeEngine()
    const scenario: ScenarioSpec = {
      name: 'test',
      entities: [],
      sensors: [minimalSpec()],
    }
    engine.loadScenario(scenario)
    engine.step(DT)
    expect(engine.state.lidarScans.size()).toBe(1)
    const scan = engine.state.lidarScans.get('lidar_front')!
    expect(scan).toBeTruthy()
    expect(scan.ranges.length).toBe(5)
  })

  it('does not produce a scan when enabled: false', () => {
    const engine = makeEngine()
    engine.loadScenario({
      name: 'test',
      entities: [],
      sensors: [minimalSpec({ enabled: false })],
    })
    engine.step(DT)
    expect(engine.state.lidarScans.size()).toBe(0)
  })

  it('stores the scan with sensorId matching the spec id', () => {
    const engine = makeEngine()
    engine.loadScenario({
      name: 'test',
      entities: [],
      sensors: [minimalSpec({ id: 'my_sensor' })],
    })
    engine.step(DT)
    const scan = engine.state.lidarScans.get('my_sensor')
    expect(scan?.sensorId).toBe('my_sensor')
  })

  it('replaces the previous scan on the next period', () => {
    const engine = makeEngine()
    engine.loadScenario({
      name: 'test',
      entities: [],
      sensors: [minimalSpec()],
    })
    engine.step(DT)
    const t1 = engine.state.lidarScans.get('lidar_front')!.timeSec
    engine.step(DT)
    const t2 = engine.state.lidarScans.get('lidar_front')!.timeSec
    expect(t2).toBeGreaterThan(t1)
    expect(engine.state.lidarScans.size()).toBe(1)
  })

  it('all ranges equal rangeMax when no obstacles present', () => {
    const engine = makeEngine()
    engine.loadScenario({
      name: 'test',
      entities: [],
      sensors: [minimalSpec({ includeStaticObstacles: true })],
    })
    engine.step(DT)
    const scan = engine.state.lidarScans.get('lidar_front')!
    for (const r of scan.ranges) {
      expect(r).toBeCloseTo(8, 5)
    }
  })

  it('lidarScans cleared on engine.reset()', () => {
    const engine = makeEngine()
    engine.loadScenario({ name: 'test', entities: [], sensors: [minimalSpec()] })
    engine.step(DT)
    expect(engine.state.lidarScans.size()).toBe(1)
    engine.reset()
    expect(engine.state.lidarScans.size()).toBe(0)
  })

  it('scan stores world-space origin for sensor without a parent entity', () => {
    const engine = makeEngine()
    engine.loadScenario({
      name: 'test',
      entities: [],
      sensors: [minimalSpec({ pose: { x: 1.5, y: 2.0, yaw: 0.5 } })],
    })
    engine.step(DT)
    const scan = engine.state.lidarScans.get('lidar_front')!
    expect(scan.originX).toBeCloseTo(1.5, 5)
    expect(scan.originY).toBeCloseTo(2.0, 5)
    expect(scan.worldYaw).toBeCloseTo(0.5, 5)
  })

  it('scan stores world-space origin when mounted on a vehicle at a known pose', () => {
    const engine = makeEngine()
    // Vehicle at (2, 3, yaw=0). Sensor mounted at local offset (0.3, 0, yaw=0).
    // Expected world origin: (2.3, 3), worldYaw: 0.
    engine.loadScenario({
      name: 'test',
      entities: [{ kind: 'vehicle', id: 'ego', pose: { x: 2, y: 3, yaw: 0 } }],
      sensors: [minimalSpec({ parentEntityId: 'ego', pose: { x: 0.3, y: 0, yaw: 0 } })],
    })
    engine.step(DT)
    const scan = engine.state.lidarScans.get('lidar_front')!
    expect(scan.originX).toBeCloseTo(2.3, 5)
    expect(scan.originY).toBeCloseTo(3.0, 5)
    expect(scan.worldYaw).toBeCloseTo(0, 5)
  })

  it('scan world origin rotates with vehicle yaw', () => {
    const engine = makeEngine()
    // Vehicle at (0, 0, yaw=π/2). Sensor at local (1, 0, yaw=0).
    // World origin: (cos(π/2)*1 - sin(π/2)*0, sin(π/2)*1 + cos(π/2)*0) = (0, 1).
    // worldYaw = π/2.
    engine.loadScenario({
      name: 'test',
      entities: [{ kind: 'vehicle', id: 'ego', pose: { x: 0, y: 0, yaw: Math.PI / 2 } }],
      sensors: [minimalSpec({ parentEntityId: 'ego', pose: { x: 1, y: 0, yaw: 0 } })],
    })
    engine.step(DT)
    const scan = engine.state.lidarScans.get('lidar_front')!
    expect(scan.originX).toBeCloseTo(0, 5)
    expect(scan.originY).toBeCloseTo(1, 5)
    expect(scan.worldYaw).toBeCloseTo(Math.PI / 2, 5)
  })
})

describe('ScenarioLoader sensor parsing', () => {
  it('accepts a valid lidar2d sensor block', () => {
    const raw = {
      name: 'lidar-demo',
      entities: [],
      sensors: [
        {
          kind: 'lidar2d',
          id: 'front',
          angleMin: -1.57,
          angleMax: 1.57,
          rayCount: 181,
          rangeMin: 0.05,
          rangeMax: 8,
          rateHz: 10,
        },
      ],
    }
    const spec = ScenarioLoader.parse(raw)
    expect(spec.sensors).toHaveLength(1)
    expect(spec.sensors![0].id).toBe('front')
  })

  it('scenarios without sensors still parse', () => {
    const spec = ScenarioLoader.parse({ name: 'no-sensors', entities: [] })
    expect(spec.sensors).toBeUndefined()
  })

  it('rejects unknown kind', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [],
        sensors: [{ kind: 'lidar3d', id: 'x', angleMin: 0, angleMax: 1, rayCount: 10, rangeMin: 0, rangeMax: 5 }],
      }),
    ).toThrow('lidar2d')
  })

  it('rejects angleMax <= angleMin', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [],
        sensors: [{ kind: 'lidar2d', id: 'x', angleMin: 1, angleMax: 0, rayCount: 10, rangeMin: 0, rangeMax: 5 }],
      }),
    ).toThrow('angleMax')
  })

  it('rejects rayCount < 2', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [],
        sensors: [{ kind: 'lidar2d', id: 'x', angleMin: -1, angleMax: 1, rayCount: 1, rangeMin: 0, rangeMax: 5 }],
      }),
    ).toThrow('rayCount')
  })

  it('validates noise config probabilities in [0,1]', () => {
    expect(() =>
      ScenarioLoader.parse({
        name: 'bad',
        entities: [],
        sensors: [{
          kind: 'lidar2d', id: 'x', angleMin: -1, angleMax: 1, rayCount: 10, rangeMin: 0, rangeMax: 5,
          noise: { dropoutProbability: 1.5 },
        }],
      }),
    ).toThrow('[0, 1]')
  })
})
