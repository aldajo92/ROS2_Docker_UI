import { describe, expect, it } from 'vitest'
import { parseReplayJson } from './ReplayFileLoader'
import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from '../../simulation/recording/ReplayFormat'

function buildValidJson(
  overrides: Partial<ReplayFileFormat> = {},
): string {
  const base: ReplayFileFormat = {
    format: REPLAY_FORMAT_TAG,
    version: REPLAY_FORMAT_VERSION,
    fixedDtSec: 1 / 60,
    frames: [
      { tick: 1, timeSec: 0, entities: [] },
      { tick: 2, timeSec: 1 / 60, entities: [] },
    ],
    ...overrides,
  }
  return JSON.stringify(base)
}

describe('parseReplayJson', () => {
  it('accepts a well-formed replay envelope', () => {
    const result = parseReplayJson(buildValidJson({ scenarioName: 'demo' }))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.replay.format).toBe(REPLAY_FORMAT_TAG)
      expect(result.replay.version).toBe(REPLAY_FORMAT_VERSION)
      expect(result.replay.scenarioName).toBe('demo')
      expect(result.replay.frames).toHaveLength(2)
    }
  })

  it('rejects invalid JSON with a descriptive message', () => {
    const result = parseReplayJson('{"format":')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/invalid json/i)
    }
  })

  it('rejects non-object roots', () => {
    const result = parseReplayJson(JSON.stringify(['foo']))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/object/i)
    }
  })

  it('rejects an unrecognized format tag', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: 'something_else',
        version: REPLAY_FORMAT_VERSION,
        fixedDtSec: 0.05,
        frames: [],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/format/i)
  })

  it('rejects unsupported versions', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: REPLAY_FORMAT_TAG,
        version: 999,
        fixedDtSec: 0.05,
        frames: [{ tick: 1, timeSec: 0, entities: [] }],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/version/i)
  })

  it('rejects non-positive fixedDtSec', () => {
    const result = parseReplayJson(buildValidJson({ fixedDtSec: 0 }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/fixedDtSec/i)
  })

  it('rejects missing frames array', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: REPLAY_FORMAT_TAG,
        version: REPLAY_FORMAT_VERSION,
        fixedDtSec: 0.05,
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/frames/i)
  })

  it('rejects empty frame arrays', () => {
    const result = parseReplayJson(buildValidJson({ frames: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/no frames/i)
  })

  it('rejects frames with non-finite tick', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: REPLAY_FORMAT_TAG,
        version: REPLAY_FORMAT_VERSION,
        fixedDtSec: 0.05,
        frames: [{ tick: 'one', timeSec: 0, entities: [] }],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/tick/i)
  })

  it('rejects frames with non-finite timeSec', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: REPLAY_FORMAT_TAG,
        version: REPLAY_FORMAT_VERSION,
        fixedDtSec: 0.05,
        frames: [{ tick: 1, timeSec: null, entities: [] }],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/timeSec/i)
  })

  it('rejects frames whose entities are not an array', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: REPLAY_FORMAT_TAG,
        version: REPLAY_FORMAT_VERSION,
        fixedDtSec: 0.05,
        frames: [{ tick: 1, timeSec: 0, entities: { foo: 1 } }],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/entities/i)
  })

  it('reports the offending frame index in the error', () => {
    const result = parseReplayJson(
      JSON.stringify({
        format: REPLAY_FORMAT_TAG,
        version: REPLAY_FORMAT_VERSION,
        fixedDtSec: 0.05,
        frames: [
          { tick: 1, timeSec: 0, entities: [] },
          { tick: Number.NaN, timeSec: 0.1, entities: [] },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/frame 1/i)
  })
})
