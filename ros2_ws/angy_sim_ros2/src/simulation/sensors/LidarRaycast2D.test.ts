import { describe, it, expect } from 'vitest'
import { castLidarRay2D, type CircleShape2D, type RectangleShape2D } from './LidarRaycast2D'

const EPSILON = 1e-6

describe('castLidarRay2D', () => {
  describe('circle obstacle', () => {
    const circle: CircleShape2D = { kind: 'circle', id: 'c1', cx: 5, cy: 0, radius: 1 }

    it('ray along +X hits the circle', () => {
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [circle],
      )
      expect(hit).toBeTruthy()
      expect(hit!.range).toBeCloseTo(4, 5) // front of circle at x=4
    })

    it('ray parallel to circle misses', () => {
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 3 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [circle],
      )
      expect(hit).toBeUndefined()
    })

    it('ray that starts inside the circle returns the exit point', () => {
      const hit = castLidarRay2D(
        { origin: { x: 5, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [circle],
      )
      expect(hit).toBeTruthy()
      expect(hit!.range).toBeCloseTo(1, 5) // exits at x=6
    })

    it('closest hit wins when multiple shapes are in path', () => {
      const far: CircleShape2D = { kind: 'circle', id: 'c2', cx: 10, cy: 0, radius: 1 }
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [far, circle],
      )
      expect(hit!.objectId).toBe('c1')
      expect(hit!.range).toBeCloseTo(4, 5)
    })

    it('hit beyond rangeMax is ignored', () => {
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 3 },
        [circle],
      )
      expect(hit).toBeUndefined()
    })

    it('hit within rangeMin is ignored', () => {
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 5, rangeMax: 20 },
        [circle],
      )
      expect(hit).toBeUndefined()
    })
  })

  describe('rectangle obstacle', () => {
    // Axis-aligned 4×2 rectangle centred at (5, 0)
    const rect: RectangleShape2D = {
      kind: 'rectangle',
      id: 'r1',
      cx: 5,
      cy: 0,
      length: 4,
      thickness: 2,
      yaw: 0,
    }

    it('ray along +X hits the front face', () => {
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [rect],
      )
      expect(hit).toBeTruthy()
      expect(hit!.range).toBeCloseTo(3, 5) // front face at x=3
    })

    it('ray that misses the rectangle laterally', () => {
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 5 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [rect],
      )
      expect(hit).toBeUndefined()
    })

    it('45-degree rotated rectangle — ray hits it', () => {
      const rotated: RectangleShape2D = {
        kind: 'rectangle',
        id: 'r2',
        cx: 5,
        cy: 0,
        length: 4,
        thickness: 2,
        yaw: Math.PI / 4, // 45 degrees
      }
      const hit = castLidarRay2D(
        { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
        [rotated],
      )
      expect(hit).toBeTruthy()
      // range is less than 5 (centre distance)
      expect(hit!.range).toBeLessThan(5)
    })
  })

  it('returns undefined when no shapes provided', () => {
    const hit = castLidarRay2D(
      { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
      [],
    )
    expect(hit).toBeUndefined()
  })

  it('hit point lies on the ray', () => {
    const circle: CircleShape2D = { kind: 'circle', id: 'c', cx: 5, cy: 0, radius: 1 }
    const hit = castLidarRay2D(
      { origin: { x: 0, y: 0 }, angle: 0, rangeMin: 0, rangeMax: 20 },
      [circle],
    )!
    expect(Math.abs(hit.point.x - hit.range)).toBeLessThan(EPSILON)
    expect(Math.abs(hit.point.y)).toBeLessThan(EPSILON)
  })
})
