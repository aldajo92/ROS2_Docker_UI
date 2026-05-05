import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  setSimPosition2D,
  setSimPose2D,
  setSimYaw,
  simPolyline2DToThreePositions,
  simSegment2DToThreePoints,
} from './ThreeSimTransform'
import { Point2D } from '../../../../math/geometry/Point2D'

// ---------------------------------------------------------------------------
// setSimPosition2D
// ---------------------------------------------------------------------------

describe('setSimPosition2D', () => {
  it('maps sim (x, y) to three (x, height, -y)', () => {
    const obj = new THREE.Object3D()
    setSimPosition2D(obj, Point2D.of(3, 4), 0.5)
    expect(obj.position.x).toBeCloseTo(3)
    expect(obj.position.y).toBeCloseTo(0.5)
    expect(obj.position.z).toBeCloseTo(-4)
  })

  it('defaults height to 0', () => {
    const obj = new THREE.Object3D()
    setSimPosition2D(obj, Point2D.of(1, 2))
    expect(obj.position.y).toBeCloseTo(0)
  })

  it('places object on the Three ground plane for sim origin', () => {
    const obj = new THREE.Object3D()
    setSimPosition2D(obj, Point2D.of(0, 0), 0)
    expect(obj.position.x).toBeCloseTo(0)
    expect(obj.position.y).toBeCloseTo(0)
    expect(obj.position.z).toBeCloseTo(0)
  })
})

// ---------------------------------------------------------------------------
// setSimYaw
// ---------------------------------------------------------------------------

describe('setSimYaw', () => {
  it('writes yaw to rotation.y (no sign flip)', () => {
    const obj = new THREE.Object3D()
    setSimYaw(obj, Math.PI / 4)
    expect(obj.rotation.y).toBeCloseTo(Math.PI / 4)
  })

  it('clears rotation.x and rotation.z', () => {
    const obj = new THREE.Object3D()
    obj.rotation.set(1, 2, 3)
    setSimYaw(obj, 0.5)
    expect(obj.rotation.x).toBeCloseTo(0)
    expect(obj.rotation.z).toBeCloseTo(0)
    expect(obj.rotation.y).toBeCloseTo(0.5)
  })

  it('zero yaw → zero rotation.y', () => {
    const obj = new THREE.Object3D()
    setSimYaw(obj, 0)
    expect(obj.rotation.y).toBeCloseTo(0)
  })
})

// ---------------------------------------------------------------------------
// setSimPose2D
// ---------------------------------------------------------------------------

describe('setSimPose2D', () => {
  it('sets both position and yaw from sim pose', () => {
    const obj = new THREE.Object3D()
    setSimPose2D(obj, { position: Point2D.of(1, 2), yaw: Math.PI / 2 }, 0.1)
    expect(obj.position.x).toBeCloseTo(1)
    expect(obj.position.y).toBeCloseTo(0.1)
    expect(obj.position.z).toBeCloseTo(-2)
    expect(obj.rotation.y).toBeCloseTo(Math.PI / 2)
  })

  it('defaults height to 0', () => {
    const obj = new THREE.Object3D()
    setSimPose2D(obj, { position: Point2D.of(5, 3), yaw: 0 })
    expect(obj.position.y).toBeCloseTo(0)
  })
})

// ---------------------------------------------------------------------------
// simPolyline2DToThreePositions
// ---------------------------------------------------------------------------

describe('simPolyline2DToThreePositions', () => {
  it('produces [x, height, -y] triples for each point', () => {
    const pts = [Point2D.of(1, 2), Point2D.of(3, 4)]
    const result = simPolyline2DToThreePositions(pts, 0.06)
    expect(result).toHaveLength(6)
    expect(result[0]).toBeCloseTo(1)   // x₀
    expect(result[1]).toBeCloseTo(0.06) // y₀ = height
    expect(result[2]).toBeCloseTo(-2)  // z₀ = -sim.y
    expect(result[3]).toBeCloseTo(3)   // x₁
    expect(result[4]).toBeCloseTo(0.06)
    expect(result[5]).toBeCloseTo(-4)  // z₁
  })

  it('returns empty Float32Array for empty input', () => {
    const result = simPolyline2DToThreePositions([], 0)
    expect(result).toHaveLength(0)
  })

  it('defaults height to 0', () => {
    const result = simPolyline2DToThreePositions([Point2D.of(0, 0)])
    expect(result[1]).toBeCloseTo(0)
  })

  it('paths render on the horizontal Three.js ground plane at the given height', () => {
    const pts = [Point2D.of(0, 0), Point2D.of(1, 0)]
    const result = simPolyline2DToThreePositions(pts, 0.05)
    // Both points should be at the same height (y component in Three.js)
    expect(result[1]).toBeCloseTo(0.05)
    expect(result[4]).toBeCloseTo(0.05)
  })
})

// ---------------------------------------------------------------------------
// simSegment2DToThreePoints
// ---------------------------------------------------------------------------

describe('simSegment2DToThreePoints', () => {
  it('maps both endpoints through simPoint2DToThree', () => {
    const [a, b] = simSegment2DToThreePoints(
      Point2D.of(1, 2),
      Point2D.of(3, 4),
      0.05,
    )
    expect(a.x).toBeCloseTo(1)
    expect(a.y).toBeCloseTo(0.05)
    expect(a.z).toBeCloseTo(-2)
    expect(b.x).toBeCloseTo(3)
    expect(b.y).toBeCloseTo(0.05)
    expect(b.z).toBeCloseTo(-4)
  })

  it('defaults height to 0', () => {
    const [a] = simSegment2DToThreePoints(Point2D.of(0, 0), Point2D.of(1, 1))
    expect(a.y).toBeCloseTo(0)
  })
})
