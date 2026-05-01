import { describe, it, expect } from 'vitest'
import { Point2D } from '../../../math/geometry/Point2D'
import { Pose2D } from '../../../math/geometry/Pose2D'
import { Vector2D } from '../../../math/geometry/Vector2D'
import { VehicleEntity } from '../../../simulation/entities/VehicleEntity'
import { StaticObstacleEntity } from '../../../simulation/entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../../../simulation/entities/DynamicActorEntity'
import { BaseEntity } from '../../../simulation/entities/BaseEntity'
import {
  resolveBoundingOutline,
  type ResolveBoundingOutlineOptions,
} from './resolveBoundingOutline'

const VEHICLE_LENGTH_RATIO = 5 / 3
const VEHICLE_WIDTH_RATIO = 1.0

const BASE: ResolveBoundingOutlineOptions = {
  vehicleShape: 'circle',
  vehicleLengthRatio: VEHICLE_LENGTH_RATIO,
  vehicleWidthRatio: VEHICLE_WIDTH_RATIO,
}

describe('resolveBoundingOutline — vehicle', () => {
  it('returns a circle outline when vehicleShape = "circle"', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(1, -2), 0.5),
      radius: 0.4,
    })

    const out = resolveBoundingOutline(v, { ...BASE, vehicleShape: 'circle' })

    expect(out).toEqual({
      kind: 'circle',
      entityId: 'ego',
      center: { x: 1, y: -2 },
      radius: 0.4,
    })
  })

  it('returns a rectangle outline when vehicleShape = "rectangle"', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(3, 4), Math.PI / 4),
      radius: 0.3,
    })

    const out = resolveBoundingOutline(v, {
      ...BASE,
      vehicleShape: 'rectangle',
    })

    expect(out).toEqual({
      kind: 'rectangle',
      entityId: 'ego',
      center: { x: 3, y: 4 },
      length: 0.3 * VEHICLE_LENGTH_RATIO,
      thickness: 0.3 * VEHICLE_WIDTH_RATIO,
      yaw: Math.PI / 4,
    })
  })

  it('derives rectangle dims from caller-supplied ratios', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(0, 0), 0),
      radius: 1.0,
    })

    const out = resolveBoundingOutline(v, {
      vehicleShape: 'rectangle',
      vehicleLengthRatio: 2,
      vehicleWidthRatio: 0.5,
    })

    expect(out).toMatchObject({ kind: 'rectangle', length: 2, thickness: 0.5 })
  })
})

describe('resolveBoundingOutline — static obstacle', () => {
  it('maps circle obstacle to circle outline using shape.radius', () => {
    const o = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(5, 6),
      shape: { type: 'circle', radius: 0.25 },
    })

    const out = resolveBoundingOutline(o, BASE)

    expect(out).toEqual({
      kind: 'circle',
      entityId: 'pillar',
      center: { x: 5, y: 6 },
      radius: 0.25,
    })
  })

  it('maps legacy-radius obstacle to circle outline', () => {
    const o = new StaticObstacleEntity({
      id: 'legacy',
      position: new Point2D(-1, 2),
      radius: 0.15,
    })

    const out = resolveBoundingOutline(o, BASE)

    expect(out).toMatchObject({
      kind: 'circle',
      radius: 0.15,
    })
  })

  it('maps rectangle obstacle to rectangle outline with length/thickness/yaw', () => {
    const o = new StaticObstacleEntity({
      id: 'wall',
      position: new Point2D(0, 0),
      shape: {
        type: 'rectangle',
        length: 4,
        thickness: 0.25,
        yaw: Math.PI / 3,
      },
    })

    const out = resolveBoundingOutline(o, BASE)

    expect(out).toEqual({
      kind: 'rectangle',
      entityId: 'wall',
      center: { x: 0, y: 0 },
      length: 4,
      thickness: 0.25,
      yaw: Math.PI / 3,
    })
  })

  it('vehicleShape option is ignored for static obstacles', () => {
    const o = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(0, 0),
      shape: { type: 'circle', radius: 0.2 },
    })

    const circleMode = resolveBoundingOutline(o, {
      ...BASE,
      vehicleShape: 'circle',
    })
    const rectMode = resolveBoundingOutline(o, {
      ...BASE,
      vehicleShape: 'rectangle',
    })

    expect(circleMode).toEqual(rectMode)
  })
})

describe('resolveBoundingOutline — dynamic actor', () => {
  it('returns a circle outline using entity.radius', () => {
    const a = new DynamicActorEntity({
      id: 'npc',
      pose: new Pose2D(new Point2D(-3, 0), 0),
      velocity: new Vector2D(0, 0),
      radius: 0.2,
    })

    const out = resolveBoundingOutline(a, BASE)

    expect(out).toEqual({
      kind: 'circle',
      entityId: 'npc',
      center: { x: -3, y: 0 },
      radius: 0.2,
    })
  })
})

describe('resolveBoundingOutline — unknown entity', () => {
  class MarkerEntity extends BaseEntity {
    constructor(id: string) {
      super(id, 'marker')
    }
  }

  it('returns undefined for entity types with no rule', () => {
    const out = resolveBoundingOutline(new MarkerEntity('m'), BASE)
    expect(out).toBeUndefined()
  })
})
