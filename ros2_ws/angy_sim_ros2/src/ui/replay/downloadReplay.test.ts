// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadReplay } from './ReplayFileDownloader'
import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from '../../simulation/recording/ReplayFormat'

function makeReplay(scenarioName = 'demo'): ReplayFileFormat {
  return {
    format: REPLAY_FORMAT_TAG,
    version: REPLAY_FORMAT_VERSION,
    scenarioName,
    fixedDtSec: 1 / 60,
    frames: [{ tick: 1, timeSec: 0.1, entities: [] }],
  }
}

describe('downloadReplay (DOM-side)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>
  let originalCreate: typeof URL.createObjectURL
  let originalRevoke: typeof URL.revokeObjectURL

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:fake-url')
    revokeObjectURL = vi.fn()
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectURL as unknown as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    document.body.innerHTML = ''
  })

  it('creates a Blob of type application/json', () => {
    downloadReplay(makeReplay(), { now: () => 0 })
    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/json')
  })

  it('serializes the replay envelope into the Blob payload', async () => {
    const replay = makeReplay()
    downloadReplay(replay, { now: () => 0 })
    const blob = createObjectURL.mock.calls[0][0] as Blob
    const text = await blob.text()
    expect(JSON.parse(text)).toEqual(replay)
  })

  it('clicks an anchor whose download attribute matches buildReplayFileName', () => {
    const clicked: HTMLAnchorElement[] = []
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function () {
      clicked.push(this)
    }
    try {
      downloadReplay(makeReplay('my-scenario'), { now: () => 0 })
    } finally {
      HTMLAnchorElement.prototype.click = originalClick
    }
    expect(clicked).toHaveLength(1)
    const anchor = clicked[0]
    expect(anchor.download.startsWith('my-scenario-replay-')).toBe(true)
    expect(anchor.download.endsWith('.angy-replay.json')).toBe(true)
    expect(anchor.href).toContain('blob:fake-url')
  })

  it('removes the anchor and revokes the object URL after click', () => {
    HTMLAnchorElement.prototype.click = function () {
      // capture document state mid-click
      expect(document.body.querySelector('a')).not.toBeNull()
    }
    downloadReplay(makeReplay(), { now: () => 0 })
    expect(document.body.querySelector('a')).toBeNull()
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })

  it('still revokes the object URL when the click handler throws', () => {
    HTMLAnchorElement.prototype.click = function () {
      throw new Error('boom')
    }
    expect(() => downloadReplay(makeReplay(), { now: () => 0 })).toThrow(
      'boom',
    )
    expect(revokeObjectURL).toHaveBeenCalledOnce()
    expect(document.body.querySelector('a')).toBeNull()
  })
})
