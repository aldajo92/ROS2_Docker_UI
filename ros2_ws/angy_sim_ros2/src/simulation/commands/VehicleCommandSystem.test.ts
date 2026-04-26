import { describe, expect, it } from 'vitest'
import { VehicleCommandSystem } from './VehicleCommandSystem'
import { VehicleCommandQueue } from './VehicleCommandQueue'
import { SimulationState } from '../core/SimulationState'
import { SimulationClock } from '../core/SimulationClock'
import { EntityManager } from '../core/EntityManager'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { VehicleEntity } from '../entities/VehicleEntity'
import { StaticObstacleEntity } from '../entities/StaticObstacleEntity'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'

function makeState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

describe('VehicleCommandSystem', () => {
  it('drains the queue and applies commands to the matching vehicle', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    const state = makeState()
    const ego = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) })
    state.entities.add(ego)

    queue.push({ vehicleId: 'ego', linearVelocity: 1.5, angularVelocity: -0.5 })
    sys.update(0.016, state)

    expect(ego.controls).toEqual({ v: 1.5, w: -0.5 })
    expect(queue.size()).toBe(0)
  })

  it('drains the queue even when no vehicle matches', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    const state = makeState()
    queue.push({ vehicleId: 'ghost', linearVelocity: 1 })
    queue.push({ vehicleId: 'phantom', angularVelocity: 1 })
    sys.update(0.016, state)
    expect(queue.size()).toBe(0)
  })

  it('ignores commands targeting non-vehicle entities', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    const state = makeState()
    const rock = new StaticObstacleEntity({
      id: 'rock',
      position: new Point2D(0, 0),
      radius: 0.5,
    })
    state.entities.add(rock)

    queue.push({ vehicleId: 'rock', linearVelocity: 9 })
    expect(() => sys.update(0.016, state)).not.toThrow()
    expect(queue.size()).toBe(0)
  })

  it('is a no-op when the queue is empty', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    const state = makeState()
    const ego = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 0.7, w: 0.1 },
    })
    state.entities.add(ego)

    sys.update(0.016, state)
    expect(ego.controls).toEqual({ v: 0.7, w: 0.1 })
  })

  it('applies multiple commands in order — last write wins', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    const state = makeState()
    const ego = new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0) })
    state.entities.add(ego)

    queue.push({ vehicleId: 'ego', linearVelocity: 1, angularVelocity: 1 })
    queue.push({ vehicleId: 'ego', linearVelocity: 2, angularVelocity: 2 })
    queue.push({ vehicleId: 'ego', linearVelocity: 3, angularVelocity: 3 })
    sys.update(0.016, state)

    expect(ego.controls).toEqual({ v: 3, w: 3 })
  })

  it('reset() clears the queue', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    queue.push({ vehicleId: 'ego', linearVelocity: 1 })
    queue.push({ vehicleId: 'ego', linearVelocity: 2 })
    sys.reset()
    expect(queue.size()).toBe(0)
  })

  it('preserves sticky semantics: unset fields keep the previous value', () => {
    const queue = new VehicleCommandQueue()
    const sys = new VehicleCommandSystem(queue)
    const state = makeState()
    const ego = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: 0.3 },
    })
    state.entities.add(ego)

    queue.push({ vehicleId: 'ego', linearVelocity: 2 })
    sys.update(0.016, state)

    expect(ego.controls.v).toBe(2)
    expect(ego.controls.w).toBe(0.3)
  })
})
