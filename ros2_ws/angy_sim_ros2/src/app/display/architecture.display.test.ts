import { describe, expect, it } from 'vitest'

/**
 * Architecture-boundary tests for the generic display plugin layer.
 *
 * Rules enforced here:
 *   1. Generic display plugins (src/app/display/) must NOT import
 *      roslib, rosbridge infrastructure, renderer modules (Three.js /
 *      Phaser), or React.
 *   2. ROS transport bindings (rosbridge/display/) must NOT import
 *      renderer modules.
 *
 * These tests use the same eager import.meta.glob pattern as the
 * existing architecture.rosbridge.test.ts so they are consistent with
 * the rest of the architecture test suite.
 */

const allSources = import.meta.glob('/src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const DISPLAY_PLUGIN_DIR = '/src/app/display/'
const ROSBRIDGE_DISPLAY_DIR =
  '/src/infrastructure/communication/rosbridge/display/'

function importLines(source: string): string[] {
  return source.split('\n').filter((line) => /^\s*import\b/.test(line))
}

// ── Generic display plugins ────────────────────────────────────────────────

describe('architecture: generic display plugins (src/app/display/) are transport-free', () => {
  const pluginFiles = Object.entries(allSources).filter(
    ([path]) =>
      path.startsWith(DISPLAY_PLUGIN_DIR) && !path.endsWith('.test.ts'),
  )

  it('found at least one display plugin source file to audit', () => {
    expect(pluginFiles.length).toBeGreaterThan(0)
  })

  const forbidden = [
    { term: 'roslib', label: 'roslib' },
    { term: '/rosbridge/', label: 'rosbridge infrastructure' },
    { term: '/three/', label: 'Three.js renderer' },
    { term: '/phaser/', label: 'Phaser renderer' },
    { term: "'react'", label: 'React' },
    { term: '"react"', label: 'React' },
  ]

  for (const [path, source] of pluginFiles) {
    const lines = importLines(source)
    for (const { term, label } of forbidden) {
      it(`${path} — must NOT import ${label}`, () => {
        const offending = lines.filter((l) => l.includes(term))
        expect(
          offending,
          `Forbidden ${label} import in ${path}. ` +
            'Display plugins must be transport-agnostic and renderer-free.',
        ).toEqual([])
      })
    }
  }
})

// ── ROS transport bindings ─────────────────────────────────────────────────

describe('architecture: ROS display bindings (rosbridge/display/) are renderer-free', () => {
  const bindingFiles = Object.entries(allSources).filter(
    ([path]) =>
      path.startsWith(ROSBRIDGE_DISPLAY_DIR) && !path.endsWith('.test.ts'),
  )

  it('found at least one rosbridge display binding source file to audit', () => {
    expect(bindingFiles.length).toBeGreaterThan(0)
  })

  const rendererTerms = [
    { term: '/three/', label: 'Three.js' },
    { term: '/phaser/', label: 'Phaser' },
    { term: "'react'", label: 'React' },
    { term: '"react"', label: 'React' },
  ]

  for (const [path, source] of bindingFiles) {
    const lines = importLines(source)
    for (const { term, label } of rendererTerms) {
      it(`${path} — must NOT import ${label}`, () => {
        const offending = lines.filter((l) => l.includes(term))
        expect(
          offending,
          `Forbidden ${label} import in ${path}. ` +
            'ROS bindings must not reach into renderer modules.',
        ).toEqual([])
      })
    }
  }
})
