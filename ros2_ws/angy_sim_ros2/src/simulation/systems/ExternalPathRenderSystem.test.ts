import { describe, expect, it } from 'vitest'
import { EntityManager } from '../core/EntityManager'
import { SimulationClock } from '../core/SimulationClock'
import { SimulationState } from '../core/SimulationState'
import { TypedEventBus } from '../events/EventBus'
import type { SimulationEvents } from '../events/SimulationEvents'
import { Logger } from '../logging/Logger'
import { ExternalPathUpdateQueue } from '../paths/ExternalPathUpdateQueue'
import type { Path2D } from '../paths/Path2D'
import { ExternalPathRenderSystem } from './ExternalPathRenderSystem'

function createState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

function makePath(id: string, n: number = 2): Path2D {
  return {
    id,
    points: Array.from({ length: n }, (_, i) => ({ x: i, y: i })),
  }
}

describe('ExternalPathRenderSystem', () => {
  it('drains pending upserts into state.paths during update()', () => {
    const queue = new ExternalPathUpdateQueue()
    const system = new ExternalPathRenderSystem(queue)
    const state = createState()

    queue.enqueueUpsert(makePath('/a', 3))
    queue.enqueueUpsert(makePath('/b', 5))

    expect(state.paths.size()).toBe(0)
    system.update(0.016, state)

    expect(state.paths.size()).toBe(2)
    expect(state.paths.get('/a')?.points).toHaveLength(3)
    expect(state.paths.get('/b')?.points).toHaveLength(5)
    expect(queue.hasPending()).toBe(false)
  })

  it('drains pending removes from state.paths during update()', () => {
    const queue = new ExternalPathUpdateQueue()
    const system = new ExternalPathRenderSystem(queue)
    const state = createState()
    state.paths.add(makePath('/a'))
    state.paths.add(makePath('/b'))

    queue.enqueueRemove('/a')
    system.update(0.016, state)

    expect(state.paths.has('/a')).toBe(false)
    expect(state.paths.has('/b')).toBe(true)
  })

  it('does NOT touch state.paths if the queue is empty', () => {
    const queue = new ExternalPathUpdateQueue()
    const system = new ExternalPathRenderSystem(queue)
    const state = createState()
    state.paths.add(makePath('/a'))
    system.update(0.016, state)
    // Path is still there; update was a no-op.
    expect(state.paths.has('/a')).toBe(true)
  })

  it('an upsert overwrites an existing path with the same id (replace-in-place)', () => {
    const queue = new ExternalPathUpdateQueue()
    const system = new ExternalPathRenderSystem(queue)
    const state = createState()

    queue.enqueueUpsert(makePath('/a', 2))
    system.update(0.016, state)
    expect(state.paths.get('/a')?.points).toHaveLength(2)

    queue.enqueueUpsert(makePath('/a', 8))
    system.update(0.016, state)
    expect(state.paths.get('/a')?.points).toHaveLength(8)
  })

  it('reset() drops pending updates without applying them', () => {
    const queue = new ExternalPathUpdateQueue()
    const system = new ExternalPathRenderSystem(queue)
    queue.enqueueUpsert(makePath('/a'))
    expect(queue.hasPending()).toBe(true)
    system.reset()
    expect(queue.hasPending()).toBe(false)
  })

  it('exposes the canonical name for SystemManager identity', () => {
    const queue = new ExternalPathUpdateQueue()
    const system = new ExternalPathRenderSystem(queue)
    expect(system.name).toBe('ExternalPathRenderSystem')
  })
})
