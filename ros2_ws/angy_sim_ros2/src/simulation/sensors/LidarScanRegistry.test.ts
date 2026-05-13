import { describe, it, expect, beforeEach } from 'vitest'
import { LidarScanRegistry } from './LidarScanRegistry'
import type { LidarScan2D } from './LidarScan2D'

function makeScan(id: string): LidarScan2D {
  return {
    id,
    sensorId: id,
    timeSec: 0,
    angleMin: -Math.PI / 2,
    angleMax: Math.PI / 2,
    angleIncrement: Math.PI,
    rangeMin: 0.05,
    rangeMax: 8,
    ranges: [1, 2],
  }
}

describe('LidarScanRegistry', () => {
  let registry: LidarScanRegistry

  beforeEach(() => {
    registry = new LidarScanRegistry()
  })

  it('starts empty', () => {
    expect(registry.size()).toBe(0)
    expect(registry.toArray()).toEqual([])
  })

  it('add / get / has round-trip', () => {
    const scan = makeScan('a')
    registry.add(scan)
    expect(registry.has('a')).toBe(true)
    expect(registry.get('a')).toBe(scan)
    expect(registry.size()).toBe(1)
  })

  it('upserts an existing id', () => {
    registry.add(makeScan('a'))
    const newer = { ...makeScan('a'), timeSec: 1 }
    registry.add(newer)
    expect(registry.size()).toBe(1)
    expect(registry.get('a')?.timeSec).toBe(1)
  })

  it('remove deletes the entry', () => {
    registry.add(makeScan('a'))
    registry.remove('a')
    expect(registry.has('a')).toBe(false)
    expect(registry.size()).toBe(0)
  })

  it('toArray returns a snapshot — mutating it does not affect the registry', () => {
    registry.add(makeScan('x'))
    const arr = registry.toArray()
    arr.pop()
    expect(registry.size()).toBe(1)
  })

  it('clear empties the registry', () => {
    registry.add(makeScan('a'))
    registry.add(makeScan('b'))
    registry.clear()
    expect(registry.size()).toBe(0)
    expect(registry.toArray()).toEqual([])
  })
})
