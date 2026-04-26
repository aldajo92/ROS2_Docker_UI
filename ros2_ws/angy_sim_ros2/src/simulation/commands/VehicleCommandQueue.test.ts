import { describe, expect, it } from 'vitest'
import { VehicleCommandQueue } from './VehicleCommandQueue'
import type { VehicleCommand } from './VehicleCommand'

function cmd(vehicleId: string, linear: number): VehicleCommand {
  return { vehicleId, linearVelocity: linear, source: 'keyboard' }
}

describe('VehicleCommandQueue', () => {
  it('starts empty', () => {
    const q = new VehicleCommandQueue()
    expect(q.size()).toBe(0)
    expect(q.drain()).toEqual([])
  })

  it('push increases size', () => {
    const q = new VehicleCommandQueue()
    q.push(cmd('ego', 1))
    q.push(cmd('ego', 2))
    expect(q.size()).toBe(2)
  })

  it('drain returns commands in FIFO order', () => {
    const q = new VehicleCommandQueue()
    q.push(cmd('ego', 1))
    q.push(cmd('ego', 2))
    q.push(cmd('ego', 3))
    const drained = q.drain()
    expect(drained.map((c) => c.linearVelocity)).toEqual([1, 2, 3])
  })

  it('drain empties the queue', () => {
    const q = new VehicleCommandQueue()
    q.push(cmd('ego', 1))
    q.push(cmd('ego', 2))
    q.drain()
    expect(q.size()).toBe(0)
    expect(q.drain()).toEqual([])
  })

  it('drain returns a fresh array — mutating it does not affect later pushes', () => {
    const q = new VehicleCommandQueue()
    q.push(cmd('ego', 1))
    const drained = q.drain()
    drained.push(cmd('ghost', 99))
    q.push(cmd('ego', 2))
    expect(q.drain().map((c) => c.vehicleId)).toEqual(['ego'])
  })

  it('clear empties the queue without returning anything', () => {
    const q = new VehicleCommandQueue()
    q.push(cmd('ego', 1))
    q.push(cmd('ego', 2))
    q.clear()
    expect(q.size()).toBe(0)
  })
})
