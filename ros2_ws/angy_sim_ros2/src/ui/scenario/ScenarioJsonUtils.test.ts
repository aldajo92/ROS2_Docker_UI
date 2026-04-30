// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScenarioSpec } from '../../simulation/scenarios/Scenario'
import {
  buildScenarioFileName,
  downloadScenarioJsonText,
  formatScenarioJson,
} from './ScenarioJsonUtils'

const SAMPLE_SPEC: ScenarioSpec = {
  name: 'unit-fixture',
  description: 'Used by ScenarioJsonUtils unit tests.',
  entities: [
    {
      kind: 'vehicle',
      id: 'ego',
      pose: { x: 0, y: 0, yaw: 0 },
    },
  ],
}

describe('formatScenarioJson', () => {
  it('produces pretty-printed two-space-indented JSON', () => {
    const text = formatScenarioJson(SAMPLE_SPEC)
    expect(text).toContain('{\n  "name": "unit-fixture"')
    expect(text).toMatch(/^\{\n {2}/)
  })

  it('round-trips through JSON.parse without information loss', () => {
    const text = formatScenarioJson(SAMPLE_SPEC)
    const reparsed = JSON.parse(text) as ScenarioSpec
    expect(reparsed).toEqual(SAMPLE_SPEC)
  })
})

describe('buildScenarioFileName', () => {
  const fixedNow = () => Date.UTC(2026, 3, 30, 12, 34, 56)

  it('uses the explicit fileName when provided (skips timestamp)', () => {
    const name = buildScenarioFileName({
      fileName: 'override.json',
      now: fixedNow,
    })
    expect(name).toBe('override.json')
  })

  it('falls back to the "scenario" base when none is provided', () => {
    const name = buildScenarioFileName({ now: fixedNow })
    expect(name).toMatch(/^scenario-scenario-\d{8}T\d{6}\.json$/)
  })

  it('sanitizes the base name (strips spaces, slashes, weird chars)', () => {
    const name = buildScenarioFileName({
      baseName: 'Roundabout / Demo  v2!',
      now: fixedNow,
    })
    expect(name).toMatch(/^Roundabout-Demo-v2-scenario-\d{8}T\d{6}\.json$/)
  })

  it('includes a deterministic compact ISO-like timestamp', () => {
    const name = buildScenarioFileName({
      baseName: 'demo',
      now: () => new Date('2026-04-30T12:34:56').getTime(),
    })
    expect(name).toBe('demo-scenario-20260430T123456.json')
  })
})

describe('downloadScenarioJsonText', () => {
  let createObjectURLSpy: ReturnType<typeof vi.fn>
  let revokeObjectURLSpy: ReturnType<typeof vi.fn>
  let originalCreate: typeof URL.createObjectURL | undefined
  let originalRevoke: typeof URL.revokeObjectURL | undefined

  beforeEach(() => {
    originalCreate = URL.createObjectURL
    originalRevoke = URL.revokeObjectURL
    createObjectURLSpy = vi.fn(() => 'blob:mock-url')
    revokeObjectURLSpy = vi.fn()
    URL.createObjectURL =
      createObjectURLSpy as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL =
      revokeObjectURLSpy as unknown as typeof URL.revokeObjectURL
  })

  afterEach(() => {
    if (originalCreate) URL.createObjectURL = originalCreate
    if (originalRevoke) URL.revokeObjectURL = originalRevoke
  })

  it('creates a Blob, clicks the anchor with the suggested file name, and revokes the URL', () => {
    const text = formatScenarioJson(SAMPLE_SPEC)
    const clickSpy = vi.fn()
    const realCreate = document.createElement.bind(document)
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tagName: string) => {
        const el = realCreate(tagName)
        if (tagName === 'a') {
          ;(el as HTMLAnchorElement).click =
            clickSpy as unknown as HTMLAnchorElement['click']
        }
        return el
      })

    try {
      downloadScenarioJsonText(text, {
        baseName: SAMPLE_SPEC.name,
        now: () => new Date('2026-04-30T12:34:56').getTime(),
      })

      expect(createObjectURLSpy).toHaveBeenCalledTimes(1)
      const blobArg = createObjectURLSpy.mock.calls[0][0] as Blob
      expect(blobArg).toBeInstanceOf(Blob)
      expect(blobArg.type).toBe('application/json')

      // Anchor was created exactly once with the right `download` attr.
      const anchorCall = createElementSpy.mock.calls.find(
        ([tag]) => tag === 'a',
      )
      expect(anchorCall).toBeDefined()
      const anchor = createElementSpy.mock.results.find(
        (r) => (r.value as HTMLElement).tagName === 'A',
      )?.value as HTMLAnchorElement
      expect(anchor.download).toBe(
        'unit-fixture-scenario-20260430T123456.json',
      )

      expect(clickSpy).toHaveBeenCalledTimes(1)
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
    } finally {
      createElementSpy.mockRestore()
    }
  })

  it('writes the textarea text verbatim into the Blob (does not re-serialize)', async () => {
    const dirtyText = '{\n  "name": "wip",\n  // user note\n}\n'
    let captured: Blob | undefined
    createObjectURLSpy.mockImplementation((b: unknown) => {
      captured = b as Blob
      return 'blob:mock-url'
    })

    downloadScenarioJsonText(dirtyText, { baseName: 'wip' })
    expect(captured).toBeDefined()
    if (!captured) throw new Error('expected blob to be captured')
    const roundtrip = await captured.text()
    expect(roundtrip).toBe(dirtyText)
  })

  it('aborts gracefully outside a browser environment', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const original = URL.createObjectURL
    // Simulate non-browser by removing the API entirely.
    ;(URL as { createObjectURL?: typeof URL.createObjectURL }).createObjectURL =
      undefined

    try {
      expect(() =>
        downloadScenarioJsonText('{}', { baseName: 'x' }),
      ).not.toThrow()
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      URL.createObjectURL = original
      errorSpy.mockRestore()
    }
  })
})
