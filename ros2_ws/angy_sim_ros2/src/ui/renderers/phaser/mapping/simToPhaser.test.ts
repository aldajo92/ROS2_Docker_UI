import { describe, expect, it } from 'vitest'
import { Point2D } from '../../../../math/geometry/Point2D'
import { Vector2D } from '../../../../math/geometry/Vector2D'
import {
  simLengthToPhaser,
  simPoint2DToPhaser,
  simVector2DToPhaser,
  simYawToPhaserRotation,
  type PhaserViewport,
} from './simToPhaser'
import {
  phaserLengthToSim,
  phaserPointToSimPoint2D,
  phaserRotationToSimYaw,
} from './phaserToSim'

const makeViewport = (
  overrides: Partial<PhaserViewport> = {},
): PhaserViewport => ({
  originX: 400,
  originY: 300,
  pixelsPerMeter: 50,
  ...overrides,
})

describe('simPoint2DToPhaser', () => {
  it('places sim origin at the configured viewport origin', () => {
    const out = simPoint2DToPhaser(Point2D.origin(), makeViewport())
    expect(out).toEqual({ x: 400, y: 300 })
  })

  it('puts +X to the right of the origin', () => {
    const out = simPoint2DToPhaser(Point2D.of(2, 0), makeViewport())
    expect(out).toEqual({ x: 400 + 2 * 50, y: 300 })
  })

  it('puts +Y above the origin (canvas Y is flipped)', () => {
    const out = simPoint2DToPhaser(Point2D.of(0, 3), makeViewport())
    // sim +Y → screen-up → smaller canvas Y.
    expect(out).toEqual({ x: 400, y: 300 - 3 * 50 })
  })

  it('puts -Y below the origin', () => {
    const out = simPoint2DToPhaser(Point2D.of(0, -3), makeViewport())
    expect(out).toEqual({ x: 400, y: 300 + 3 * 50 })
  })

  it('respects pixelsPerMeter for arbitrary points', () => {
    const out = simPoint2DToPhaser(
      Point2D.of(1.5, -2.5),
      makeViewport({ pixelsPerMeter: 100, originX: 0, originY: 0 }),
    )
    expect(out).toEqual({ x: 150, y: 250 })
  })
})

describe('simVector2DToPhaser', () => {
  it('does not apply the origin offset', () => {
    const out = simVector2DToPhaser(Vector2D.of(1, 1), 50)
    expect(out).toEqual({ x: 50, y: -50 })
  })

  it('zero stays zero', () => {
    const out = simVector2DToPhaser(Vector2D.of(0, 0), 50)
    expect(out.x).toBe(0)
    expect(Math.abs(out.y)).toBe(0)
  })
})

describe('simLengthToPhaser', () => {
  it('multiplies by pixelsPerMeter', () => {
    expect(simLengthToPhaser(2, 50)).toBe(100)
  })

  it('handles fractional meters', () => {
    expect(simLengthToPhaser(0.4, 60)).toBeCloseTo(24, 10)
  })
})

describe('simYawToPhaserRotation', () => {
  // Phaser rotation is positive clockwise (because Phaser +Y is
  // screen-down and rotation moves local +X toward local +Y). Since
  // the renderer flips the sim screen Y axis, a CCW sim yaw must
  // appear CCW on screen, which means negating the angle.
  it('zero yaw is zero rotation', () => {
    expect(Math.abs(simYawToPhaserRotation(0))).toBe(0)
  })

  it('positive sim yaw becomes negative phaser rotation', () => {
    expect(simYawToPhaserRotation(Math.PI / 2)).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('negative sim yaw becomes positive phaser rotation', () => {
    expect(simYawToPhaserRotation(-Math.PI / 4)).toBeCloseTo(Math.PI / 4, 10)
  })
})

describe('round-trip through phaserToSim helpers', () => {
  it('point round-trip', () => {
    const viewport = makeViewport()
    const sim = Point2D.of(2.5, -1.25)
    const screen = simPoint2DToPhaser(sim, viewport)
    const back = phaserPointToSimPoint2D(screen, viewport)
    expect(back.x).toBeCloseTo(sim.x, 10)
    expect(back.y).toBeCloseTo(sim.y, 10)
  })

  it('yaw round-trip', () => {
    const yaw = 0.42
    expect(phaserRotationToSimYaw(simYawToPhaserRotation(yaw))).toBeCloseTo(
      yaw,
      10,
    )
  })

  it('length round-trip', () => {
    expect(phaserLengthToSim(simLengthToPhaser(3.7, 60), 60)).toBeCloseTo(
      3.7,
      10,
    )
  })
})
