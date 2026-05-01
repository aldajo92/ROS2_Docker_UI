import { describe, expect, it } from 'vitest'
import { Point2D } from '../../math/geometry/Point2D'
import { StaticObstacleEntity } from './StaticObstacleEntity'

describe('StaticObstacleEntity (circle)', () => {
  it('accepts the legacy { position, radius } constructor', () => {
    const e = new StaticObstacleEntity({
      id: 'c',
      position: new Point2D(1, 2),
      radius: 0.5,
    })
    expect(e.id).toBe('c')
    expect(e.type).toBe('static_obstacle')
    expect(e.position.x).toBe(1)
    expect(e.position.y).toBe(2)
    expect(e.radius).toBe(0.5)
    expect(e.shape).toEqual({ type: 'circle', radius: 0.5 })
  })

  it('accepts an explicit circle shape option', () => {
    const e = new StaticObstacleEntity({
      id: 'c',
      position: new Point2D(0, 0),
      shape: { type: 'circle', radius: 0.8 },
    })
    expect(e.shape.type).toBe('circle')
    expect(e.radius).toBe(0.8)
  })

  it('throws when neither shape nor radius is provided', () => {
    expect(
      () =>
        new StaticObstacleEntity({
          id: 'c',
          position: new Point2D(0, 0),
        } as unknown as ConstructorParameters<typeof StaticObstacleEntity>[0]),
    ).toThrow(/requires either a shape or a radius/)
  })
})

describe('StaticObstacleEntity (rectangle)', () => {
  it('stores normalized rectangle shape data', () => {
    const e = new StaticObstacleEntity({
      id: 'r',
      position: new Point2D(4, 2),
      shape: {
        type: 'rectangle',
        length: 2.4,
        thickness: 1.2,
        yaw: Math.PI / 4,
      },
    })
    expect(e.shape.type).toBe('rectangle')
    if (e.shape.type !== 'rectangle') throw new Error('expected rectangle')
    expect(e.shape.length).toBe(2.4)
    expect(e.shape.thickness).toBe(1.2)
    expect(e.shape.yaw).toBeCloseTo(Math.PI / 4)
  })

  it('computes bounding radius as half-diagonal of the rectangle', () => {
    const e = new StaticObstacleEntity({
      id: 'r',
      position: new Point2D(0, 0),
      shape: {
        type: 'rectangle',
        length: 4,
        thickness: 2,
        yaw: 0,
      },
    })
    // hypot(4/2, 2/2) = hypot(2, 1) = sqrt(5)
    expect(e.radius).toBeCloseTo(Math.sqrt(5))
  })

  it('ignores legacy radius when shape is provided', () => {
    const e = new StaticObstacleEntity({
      id: 'r',
      position: new Point2D(0, 0),
      radius: 99,
      shape: {
        type: 'rectangle',
        length: 2,
        thickness: 1,
        yaw: 0,
      },
    })
    if (e.shape.type !== 'rectangle') throw new Error('expected rectangle')
    expect(e.radius).toBeCloseTo(Math.hypot(1, 0.5))
    expect(e.shape.length).toBe(2)
  })
})
