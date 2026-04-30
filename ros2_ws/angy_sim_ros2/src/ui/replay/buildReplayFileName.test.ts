import { describe, expect, it } from 'vitest'
import {
  buildReplayFileName,
  serializeReplay,
} from './ReplayFileDownloader'
import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from '../../simulation/recording/ReplayFormat'

function makeReplay(scenarioName?: string): ReplayFileFormat {
  return {
    format: REPLAY_FORMAT_TAG,
    version: REPLAY_FORMAT_VERSION,
    scenarioName,
    fixedDtSec: 1 / 60,
    frames: [],
  }
}

// Fixed point in time so `compactIsoTimestamp` is deterministic. The
// helper uses local-time getters, which makes the asserted timestamp
// portion below TZ-dependent — to avoid flakes, pin it via a `now`
// that returns a Date whose UTC pieces equal the local pieces only
// for tests that do not assert on the timestamp directly.
const FIXED_NOW_MS = new Date(2026, 3, 30, 11, 14, 33).getTime() // April

describe('buildReplayFileName', () => {
  it('uses options.baseName when provided', () => {
    const name = buildReplayFileName(makeReplay('demo'), {
      baseName: 'override',
      now: () => FIXED_NOW_MS,
    })
    expect(name.startsWith('override-replay-')).toBe(true)
  })

  it('falls back to replay.scenarioName when baseName is omitted', () => {
    const name = buildReplayFileName(makeReplay('demo'), {
      now: () => FIXED_NOW_MS,
    })
    expect(name.startsWith('demo-replay-')).toBe(true)
  })

  it('falls back to "simulation" when neither is present', () => {
    const name = buildReplayFileName(makeReplay(), {
      now: () => FIXED_NOW_MS,
    })
    expect(name.startsWith('simulation-replay-')).toBe(true)
  })

  it('always ends with .angy-replay.json', () => {
    const name = buildReplayFileName(makeReplay('demo'), {
      now: () => FIXED_NOW_MS,
    })
    expect(name.endsWith('.angy-replay.json')).toBe(true)
  })

  it('embeds a deterministic timestamp when options.now is provided', () => {
    const a = buildReplayFileName(makeReplay('demo'), {
      now: () => FIXED_NOW_MS,
    })
    const b = buildReplayFileName(makeReplay('demo'), {
      now: () => FIXED_NOW_MS,
    })
    expect(a).toBe(b)
  })

  it('sanitizes filesystem-unfriendly characters', () => {
    const name = buildReplayFileName(makeReplay('  demo / scenario:1  '), {
      now: () => FIXED_NOW_MS,
    })
    expect(name).toMatch(/^demo-scenario-1-replay-/)
  })

  it('caps the base name length to keep the file name reasonable', () => {
    const longName = 'x'.repeat(500)
    const name = buildReplayFileName(makeReplay(longName), {
      now: () => FIXED_NOW_MS,
    })
    const base = name.split('-replay-')[0]
    expect(base.length).toBeLessThanOrEqual(80)
  })

  it('falls back to "simulation" when scenarioName is all-whitespace', () => {
    const name = buildReplayFileName(makeReplay('   '), {
      now: () => FIXED_NOW_MS,
    })
    expect(name.startsWith('simulation-replay-')).toBe(true)
  })
})

describe('serializeReplay', () => {
  it('produces JSON that round-trips back into the same envelope', () => {
    const replay = makeReplay('demo')
    replay.frames = [
      { tick: 1, timeSec: 0.1, entities: [] },
      { tick: 2, timeSec: 0.2, entities: [] },
    ]
    const json = serializeReplay(replay)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual(replay)
  })

  it('emits valid JSON (parses without throwing) even for empty replays', () => {
    expect(() => JSON.parse(serializeReplay(makeReplay()))).not.toThrow()
  })
})
