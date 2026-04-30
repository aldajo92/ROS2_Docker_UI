// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import {
  parseScenarioJson,
  readScenarioFromFile,
} from './ScenarioFileLoader'

const VALID_SCENARIO = {
  name: 'upload-fixture',
  description: 'A minimal valid scenario for upload tests.',
  entities: [
    {
      kind: 'vehicle',
      id: 'ego',
      pose: { x: 0, y: 0, yaw: 0 },
    },
  ],
}

const REPLAY_FILE = {
  format: 'angy_sim_replay',
  version: 1,
  fixedDtSec: 1 / 60,
  frames: [{ tick: 1, timeSec: 0, entities: [] }],
}

describe('parseScenarioJson', () => {
  it('parses a valid scenario JSON document', () => {
    const result = parseScenarioJson(JSON.stringify(VALID_SCENARIO))
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok=true')
    expect(result.spec.name).toBe('upload-fixture')
    expect(result.spec.entities).toHaveLength(1)
    expect(result.spec.entities[0]).toMatchObject({
      kind: 'vehicle',
      id: 'ego',
    })
  })

  it('rejects malformed JSON with a descriptive error', () => {
    const result = parseScenarioJson('{ this is not json')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    expect(result.error).toMatch(/^Invalid JSON:/)
  })

  it('rejects a JSON document that violates the scenario schema', () => {
    const result = parseScenarioJson(
      JSON.stringify({ name: 'bad', entities: 'nope' }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    // Surface the exact ScenarioParseError message so users can fix
    // their file without guessing.
    expect(result.error).toContain('scenario.entities must be an array')
  })

  it('rejects replay files with the dedicated message', () => {
    const result = parseScenarioJson(JSON.stringify(REPLAY_FILE))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    expect(result.error).toBe(
      'This is a replay file, not a scenario file.',
    )
  })

  it('rejects a JSON array (non-object root)', () => {
    const result = parseScenarioJson('[1, 2, 3]')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    expect(result.error).toContain('scenario must be an object')
  })
})

describe('readScenarioFromFile', () => {
  it('reads + parses a valid scenario file', async () => {
    const file = new File(
      [JSON.stringify(VALID_SCENARIO)],
      'my-scenario.json',
      { type: 'application/json' },
    )
    const result = await readScenarioFromFile(file)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok=true')
    expect(result.spec.name).toBe('upload-fixture')
  })

  it('rejects a replay file by content (regardless of filename)', async () => {
    const file = new File(
      [JSON.stringify(REPLAY_FILE)],
      // Filename intentionally lies — content is what should drive
      // the rejection.
      'looks-like-scenario.json',
      { type: 'application/json' },
    )
    const result = await readScenarioFromFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    expect(result.error).toBe(
      'This is a replay file, not a scenario file.',
    )
  })

  it('surfaces invalid JSON errors from the file body', async () => {
    const file = new File(['not json at all'], 'broken.json', {
      type: 'application/json',
    })
    const result = await readScenarioFromFile(file)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    expect(result.error).toMatch(/^Invalid JSON:/)
  })

  it('reports a "Failed to read file" error if File.text() throws', async () => {
    const fakeFile = {
      text: () => Promise.reject(new Error('boom')),
    } as unknown as File
    const result = await readScenarioFromFile(fakeFile)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected ok=false')
    expect(result.error).toBe('Failed to read file: boom')
  })
})
