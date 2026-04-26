import { describe, expect, it, vi } from 'vitest'
import { CollisionSystem } from './CollisionSystem'
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
import type { CollisionBackend2D } from '../collision/CollisionBackend2D'
import type { CollisionContact2D } from '../collision/CollisionContact2D'
import type { CollisionShape2D } from '../collision/CollisionShape2D'

function makeState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

/** Backend whose `detect` output is fully controlled by the test. */
class ScriptedBackend implements CollisionBackend2D {
  readonly name = 'ScriptedBackend'
  contacts: CollisionContact2D[] = []
  lastShapes: readonly CollisionShape2D[] = []
  resetCount = 0
  disposeCount = 0

  detect(shapes: readonly CollisionShape2D[]): CollisionContact2D[] {
    this.lastShapes = shapes
    return this.contacts
  }
  reset(): void {
    this.resetCount += 1
  }
  dispose(): void {
    this.disposeCount += 1
  }
}

describe('CollisionSystem', () => {
  it('passes 2D shapes built from state into backend.detect', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    const state = makeState()
    state.entities.add(
      new VehicleEntity({ id: 'ego', pose: Pose2D.of(0, 0, 0), radius: 0.5 }),
    )
    state.entities.add(
      new StaticObstacleEntity({
        id: 'rock',
        position: new Point2D(1, 0),
        radius: 0.5,
      }),
    )

    sys.update(0.016, state)

    expect(backend.lastShapes).toHaveLength(2)
    expect(backend.lastShapes.every((s) => s.type === 'circle')).toBe(true)
  })

  it('emits collision and bumps collisionCount on the leading edge only', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    const state = makeState()
    const handler = vi.fn()
    state.events.on('collision', handler)

    backend.contacts = [
      {
        entityAId: 'ego',
        entityBId: 'rock',
        normal: { x: 1, y: 0 },
        penetrationDepth: 0.1,
      },
    ]

    sys.update(0.016, state)
    sys.update(0.016, state) // pair still in contact next tick — must NOT re-fire.
    sys.update(0.016, state)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(state.metrics.collisionCount).toBe(1)
    expect(handler.mock.calls[0][0]).toMatchObject({
      a: 'ego',
      b: 'rock',
      normal: { x: 1, y: 0 },
      penetrationDepth: 0.1,
    })
  })

  it('re-emits when a pair separates and re-overlaps', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    const state = makeState()
    const handler = vi.fn()
    state.events.on('collision', handler)

    backend.contacts = [{ entityAId: 'a', entityBId: 'b' }]
    sys.update(0.016, state) // start
    backend.contacts = []
    sys.update(0.016, state) // separate
    backend.contacts = [{ entityAId: 'a', entityBId: 'b' }]
    sys.update(0.016, state) // restart

    expect(handler).toHaveBeenCalledTimes(2)
    expect(state.metrics.collisionCount).toBe(2)
  })

  it('orients (a, b) lexicographically and flips the normal accordingly', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    const state = makeState()
    const handler = vi.fn()
    state.events.on('collision', handler)

    // Backend reports (b, a) with normal pointing b → a.
    backend.contacts = [
      {
        entityAId: 'b',
        entityBId: 'a',
        normal: { x: 1, y: 0 },
      },
    ]
    sys.update(0.016, state)

    const payload = handler.mock.calls[0][0]
    expect(payload.a).toBe('a')
    expect(payload.b).toBe('b')
    // Flipped: now points a → b.
    expect(payload.normal.x).toBeCloseTo(-1)
    expect(payload.normal.y).toBeCloseTo(0)
  })

  it('deduplicates a pair reported twice in one tick', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    const state = makeState()
    const handler = vi.fn()
    state.events.on('collision', handler)

    backend.contacts = [
      { entityAId: 'a', entityBId: 'b' },
      { entityAId: 'b', entityBId: 'a' },
    ]
    sys.update(0.016, state)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(state.metrics.collisionCount).toBe(1)
  })

  it('reset() clears active contacts and forwards to backend', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    const state = makeState()
    const handler = vi.fn()
    state.events.on('collision', handler)

    backend.contacts = [{ entityAId: 'a', entityBId: 'b' }]
    sys.update(0.016, state)
    expect(handler).toHaveBeenCalledTimes(1)

    sys.reset()
    expect(backend.resetCount).toBe(1)

    // Same pair next tick: must fire again because reset wiped the
    // active set.
    sys.update(0.016, state)
    expect(handler).toHaveBeenCalledTimes(2)
  })

  it('dispose() forwards to backend', () => {
    const backend = new ScriptedBackend()
    const sys = new CollisionSystem(backend)
    sys.dispose()
    expect(backend.disposeCount).toBe(1)
  })
})
