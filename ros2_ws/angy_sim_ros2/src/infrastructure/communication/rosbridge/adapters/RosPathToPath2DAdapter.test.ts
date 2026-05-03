import { describe, expect, it } from 'vitest'
import { RosPathToPath2DAdapter } from './RosPathToPath2DAdapter'
import type { RosPathMessage } from '../RosMessageTypes'

function quaternionFromYaw(yaw: number) {
  const half = yaw / 2
  return { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) }
}

function makePath(
  poses: Array<{
    x: number
    y: number
    z?: number
    yaw?: number
  }>,
  options: { frameId?: string; includeHeader?: boolean } = { frameId: 'map' },
): RosPathMessage {
  const includeHeader = options.includeHeader ?? options.frameId !== undefined
  return {
    header: includeHeader ? { frame_id: options.frameId } : undefined,
    poses: poses.map((p) => ({
      pose: {
        position: { x: p.x, y: p.y, z: p.z ?? 0 },
        orientation:
          p.yaw !== undefined
            ? quaternionFromYaw(p.yaw)
            : { x: 0, y: 0, z: 0, w: 1 },
      },
    })),
  }
}

describe('RosPathToPath2DAdapter — toInternal', () => {
  it('maps a planar path with frame_id and yaw to Path2D', () => {
    const adapter = new RosPathToPath2DAdapter({
      pathId: '/circle_path',
      pathName: 'Circle path',
    })
    const message = makePath([
      { x: 0, y: 0, yaw: 0 },
      { x: 1, y: 0, yaw: Math.PI / 2 },
      { x: 1, y: 1, yaw: Math.PI },
    ])
    const path = adapter.toInternal(message)

    expect(path.id).toBe('/circle_path')
    expect(path.name).toBe('Circle path')
    expect(path.frameId).toBe('map')
    expect(path.points).toHaveLength(3)
    expect(path.points[0]).toEqual({ x: 0, y: 0, yaw: 0 })
    expect(path.points[1].x).toBe(1)
    expect(path.points[1].y).toBe(0)
    expect(path.points[1].yaw).toBeCloseTo(Math.PI / 2, 6)
    expect(path.points[2].yaw).toBeCloseTo(Math.PI, 6)
  })

  it('defaults pathName to pathId when not provided', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    const path = adapter.toInternal(makePath([{ x: 0, y: 0 }]))
    expect(path.name).toBe('/p')
  })

  it('drops yaw when the quaternion is non-planar (3D rotation)', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    const message: RosPathMessage = {
      poses: [
        {
          pose: {
            position: { x: 1, y: 2, z: 0 },
            orientation: { x: 0.5, y: 0, z: 0.5, w: 0.7071 },
          },
        },
      ],
    }
    const path = adapter.toInternal(message)
    expect(path.points[0].x).toBe(1)
    expect(path.points[0].y).toBe(2)
    expect(path.points[0].yaw).toBeUndefined()
  })

  it('omits frameId when the header has no frame_id', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    const path = adapter.toInternal(
      makePath([{ x: 0, y: 0 }], { includeHeader: true, frameId: undefined }),
    )
    expect(path.frameId).toBeUndefined()
  })

  it('omits frameId when the header is missing entirely', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    const message: RosPathMessage = {
      poses: [
        {
          pose: {
            position: { x: 0, y: 0, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    }
    const path = adapter.toInternal(message)
    expect(path.frameId).toBeUndefined()
  })

  it('produces an empty Path2D for an empty poses array', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    const path = adapter.toInternal({ poses: [] })
    expect(path.points).toEqual([])
  })
})

describe('RosPathToPath2DAdapter — validation', () => {
  it('rejects a non-object message', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    expect(() => adapter.toInternal(null)).toThrow(/Path message must be an object/)
    expect(() => adapter.toInternal(42 as never)).toThrow()
  })

  it('rejects a message without a poses array', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    expect(() => adapter.toInternal({})).toThrow(/Path\.poses must be an array/)
  })

  it('rejects a pose with a non-finite coordinate', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    const message: RosPathMessage = {
      poses: [
        {
          pose: {
            position: { x: Number.NaN, y: 0, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      ],
    }
    expect(() => adapter.toInternal(message)).toThrow(
      /position\.x must be a finite number/,
    )
  })

  it('rejects when pose is missing inside a pose-stamped entry', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    expect(() =>
      adapter.toInternal({ poses: [{} as never] }),
    ).toThrow(/poses\[0]\.pose must be an object/)
  })

  it('throws if constructed without a pathId', () => {
    expect(() => new RosPathToPath2DAdapter({ pathId: '' })).toThrow(
      /pathId must be a non-empty string/,
    )
  })
})

describe('RosPathToPath2DAdapter — fromInternal', () => {
  it('throws (outbound conversion is intentionally unimplemented)', () => {
    const adapter = new RosPathToPath2DAdapter({ pathId: '/p' })
    expect(() => adapter.fromInternal()).toThrow(/not implemented/)
  })
})
