import { describe, expect, it, vi } from 'vitest'
import { VehicleDynamicsSystem } from './VehicleDynamicsSystem'
import { KinematicVehicleMotionRuntime } from '../physics/KinematicVehicleMotionRuntime'
import type { VehicleMotionRuntime, VehicleRuntimeState } from '../physics/VehicleMotionRuntime'
import { VehicleEntity } from '../entities/VehicleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { SimulationState } from '../core/SimulationState'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Vector2D } from '../../math/geometry/Vector2D'

function makeState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

function makeMockRuntime(overrides?: Partial<VehicleMotionRuntime>): VehicleMotionRuntime {
  return {
    name: 'mock',
    reset: vi.fn(),
    syncVehicles: vi.fn(),
    step: vi.fn(),
    readVehicleState: vi.fn().mockReturnValue(undefined),
    ...overrides,
  }
}

describe('VehicleDynamicsSystem', () => {
  it('calls syncVehicles then step on the runtime', () => {
    const runtime = makeMockRuntime()
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    const vehicle = new VehicleEntity({ id: 'ego', controls: { v: 1, w: 0 } })
    state.entities.add(vehicle)

    system.update(0.1, state)

    expect(runtime.syncVehicles).toHaveBeenCalledWith([vehicle])
    expect(runtime.step).toHaveBeenCalledWith(0.1)
  })

  it('writes runtime state back into the vehicle entity', () => {
    const result: VehicleRuntimeState = {
      vehicleId: 'ego',
      pose: { x: 5, y: 3, yaw: 0.7 },
      velocity: { linear: 2, angular: 0.1 },
      distanceTraveled: 10,
    }
    const runtime = makeMockRuntime({
      readVehicleState: vi.fn().mockReturnValue(result),
    })
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    const vehicle = new VehicleEntity({ id: 'ego', controls: { v: 2, w: 0.1 } })
    state.entities.add(vehicle)

    system.update(0.1, state)

    expect(vehicle.pose.position.x).toBeCloseTo(5)
    expect(vehicle.pose.position.y).toBeCloseTo(3)
    expect(vehicle.pose.yaw).toBeCloseTo(0.7)
    expect(vehicle.v).toBeCloseTo(2)
    expect(vehicle.w).toBeCloseTo(0.1)
    expect(vehicle.distanceTraveled).toBeCloseTo(10)
  })

  it('updates peakSpeed metric from runtime state', () => {
    const result: VehicleRuntimeState = {
      vehicleId: 'ego',
      pose: { x: 0, y: 0, yaw: 0 },
      velocity: { linear: 3.5, angular: 0 },
      distanceTraveled: 3.5,
    }
    const runtime = makeMockRuntime({ readVehicleState: vi.fn().mockReturnValue(result) })
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    state.entities.add(new VehicleEntity({ id: 'ego', controls: { v: 3.5, w: 0 } }))

    system.update(1.0, state)

    expect(state.metrics.peakSpeed).toBeCloseTo(3.5)
  })

  it('accumulates totalDistance metric from the distanceTraveled delta', () => {
    const vehicle = new VehicleEntity({ id: 'ego', controls: { v: 1, w: 0 } })
    vehicle.distanceTraveled = 4
    const result: VehicleRuntimeState = {
      vehicleId: 'ego',
      pose: { x: 1, y: 0, yaw: 0 },
      velocity: { linear: 1, angular: 0 },
      distanceTraveled: 5, // delta = 1
    }
    const runtime = makeMockRuntime({ readVehicleState: vi.fn().mockReturnValue(result) })
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    state.entities.add(vehicle)
    state.metrics.totalDistance = 20

    system.update(1.0, state)

    expect(state.metrics.totalDistance).toBeCloseTo(21)
  })

  it('skips vehicle write-back when runtime returns undefined', () => {
    const runtime = makeMockRuntime({ readVehicleState: vi.fn().mockReturnValue(undefined) })
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    const vehicle = new VehicleEntity({ id: 'ego', pose: Pose2D.of(1, 2, 0), controls: { v: 1, w: 0 } })
    state.entities.add(vehicle)

    system.update(0.1, state)

    // Entity untouched
    expect(vehicle.pose.position.x).toBe(1)
  })

  it('still updates DynamicActorEntity directly', () => {
    const runtime = makeMockRuntime()
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    const actor = new DynamicActorEntity({
      id: 'obs',
      pose: Pose2D.of(0, 0, 0),
      velocity: Vector2D.of(1, 0),
    })
    state.entities.add(actor)

    system.update(1.0, state)

    expect(actor.pose.position.x).toBeCloseTo(1)
  })

  it('reset() delegates to the runtime', () => {
    const runtime = makeMockRuntime()
    const system = new VehicleDynamicsSystem(runtime)
    system.reset()
    expect(runtime.reset).toHaveBeenCalledOnce()
  })

  it('runtime state is cleared after reset and before next step', () => {
    const kinematic = new KinematicVehicleMotionRuntime()
    const system = new VehicleDynamicsSystem(kinematic)
    const state = makeState()
    const vehicle = new VehicleEntity({ id: 'ego', controls: { v: 1, w: 0 } })
    state.entities.add(vehicle)

    system.update(1.0, state)
    expect(kinematic.readVehicleState('ego')).toBeDefined()

    system.reset()
    expect(kinematic.readVehicleState('ego')).toBeUndefined()
  })

  it('does not include DynamicActorEntity in syncVehicles call', () => {
    const runtime = makeMockRuntime()
    const system = new VehicleDynamicsSystem(runtime)
    const state = makeState()
    state.entities.add(new DynamicActorEntity({ id: 'obs' }))

    system.update(0.1, state)

    expect(runtime.syncVehicles).toHaveBeenCalledWith([])
  })

  describe('with KinematicVehicleMotionRuntime (integration)', () => {
    it('integrates vehicle pose correctly end-to-end', () => {
      const system = new VehicleDynamicsSystem(new KinematicVehicleMotionRuntime())
      const state = makeState()
      const vehicle = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), controls: { v: 1, w: 0 } })
      state.entities.add(vehicle)

      system.update(1.0, state)

      expect(vehicle.pose.position.x).toBeCloseTo(1)
      expect(vehicle.pose.position.y).toBeCloseTo(0)
      expect(vehicle.distanceTraveled).toBeCloseTo(1)
    })

    it('accumulates distance over multiple ticks', () => {
      const system = new VehicleDynamicsSystem(new KinematicVehicleMotionRuntime())
      const state = makeState()
      const vehicle = new VehicleEntity({ id: 'ego', controls: { v: 1, w: 0 } })
      state.entities.add(vehicle)

      system.update(1.0, state)
      system.update(1.0, state)

      expect(vehicle.distanceTraveled).toBeCloseTo(2)
      expect(state.metrics.totalDistance).toBeCloseTo(2)
    })
  })
})
