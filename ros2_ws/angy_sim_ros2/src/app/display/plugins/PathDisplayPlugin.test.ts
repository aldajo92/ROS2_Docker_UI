import { describe, expect, it } from 'vitest'
import { pathDisplayPlugin, PATH_DISPLAY_PLUGIN_ID } from './PathDisplayPlugin'
import { ExternalPathUpdateQueue } from '../../../simulation/paths/ExternalPathUpdateQueue'
import { ExternalPoseArrayUpdateQueue } from '../../../simulation/poses/ExternalPoseArrayUpdateQueue'
import type { Path2D } from '../../../simulation/paths/Path2D'
import type { DisplayRuntimeContext } from '../DisplayPlugin'

function makeContext(): { queue: ExternalPathUpdateQueue; ctx: DisplayRuntimeContext } {
  const queue = new ExternalPathUpdateQueue()
  return { queue, ctx: { pathQueue: queue, poseArrayQueue: new ExternalPoseArrayUpdateQueue() } }
}

const BASE_PATH: Path2D = {
  id: 'test-path',
  points: [{ x: 1, y: 2 }],
}

describe('PathDisplayPlugin — identity', () => {
  it('id equals PATH_DISPLAY_PLUGIN_ID', () => {
    expect(pathDisplayPlugin.id).toBe(PATH_DISPLAY_PLUGIN_ID)
    expect(pathDisplayPlugin.id).toBe('path2d')
  })

  it('artifactKind is path2d', () => {
    expect(pathDisplayPlugin.artifactKind).toBe('path2d')
  })

  it('label is non-empty', () => {
    expect(pathDisplayPlugin.label.length).toBeGreaterThan(0)
  })

  it('defaultConfig has a color and positive thickness', () => {
    expect(pathDisplayPlugin.defaultConfig.color).toMatch(/^#/)
    expect(pathDisplayPlugin.defaultConfig.thickness).toBeGreaterThan(0)
  })
})

describe('PathDisplayPlugin — applyConfig', () => {
  it('stamps color and thickness onto the returned path', () => {
    const result = pathDisplayPlugin.applyConfig(BASE_PATH, {
      color: '#ff0000',
      thickness: 5,
    })
    expect(result.color).toBe('#ff0000')
    expect(result.thickness).toBe(5)
  })

  it('does not mutate the input path', () => {
    const snapshot = { ...BASE_PATH }
    pathDisplayPlugin.applyConfig(BASE_PATH, { color: '#abc', thickness: 3 })
    expect(BASE_PATH.color).toBeUndefined()
    expect(BASE_PATH).toEqual(snapshot)
  })

  it('preserves all other path fields', () => {
    const rich: Path2D = {
      ...BASE_PATH,
      frameId: 'map',
      name: 'my-path',
      vehicleId: 'v1',
    }
    const result = pathDisplayPlugin.applyConfig(rich, {
      color: '#abc',
      thickness: 1,
    })
    expect(result.id).toBe('test-path')
    expect(result.frameId).toBe('map')
    expect(result.name).toBe('my-path')
    expect(result.vehicleId).toBe('v1')
    expect(result.points).toEqual(BASE_PATH.points)
  })
})

describe('PathDisplayPlugin — enqueueUpsert', () => {
  it('delegates to pathQueue.enqueueUpsert with the artifact', () => {
    const { queue, ctx } = makeContext()
    pathDisplayPlugin.enqueueUpsert(BASE_PATH, ctx)
    const pending = queue.drain()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toEqual({ kind: 'upsert', path: BASE_PATH })
  })
})

describe('PathDisplayPlugin — enqueueRemove', () => {
  it('delegates to pathQueue.enqueueRemove with the id', () => {
    const { queue, ctx } = makeContext()
    pathDisplayPlugin.enqueueRemove('test-path', ctx)
    const pending = queue.drain()
    expect(pending).toHaveLength(1)
    expect(pending[0]).toEqual({ kind: 'remove', id: 'test-path' })
  })
})

describe('PathDisplayPlugin — architecture boundary', () => {
  it('does not import roslib, rosbridge, renderer, or React modules', async () => {
    const source = (
      await import('./PathDisplayPlugin?raw')
    ).default as string
    const importLines = source
      .split('\n')
      .filter((l) => /^\s*import\b/.test(l))

    const forbidden = [
      'roslib',
      '/rosbridge/',
      "'rosbridge'",
      '/three/',
      '/phaser/',
      "'react'",
      '"react"',
    ]
    for (const term of forbidden) {
      const offending = importLines.filter((l) => l.includes(term))
      expect(
        offending,
        `PathDisplayPlugin must not import "${term}"`,
      ).toEqual([])
    }
  })
})
