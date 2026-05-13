/**
 * Architecture boundary test for src/simulation/sensors.
 *
 * Rule: simulation/sensors must not import ROS, rosbridge, WebSocket,
 * infrastructure, UI, React, Three.js, Phaser, or DOM modules.
 */
import { describe, it, expect } from 'vitest'

const FORBIDDEN_PATTERNS: ReadonlyArray<{
  label: string
  test: (line: string) => boolean
}> = [
  { label: 'no roslib import',       test: (l) => /from\s+['"]roslib['"]/.test(l) },
  { label: 'no rosbridge import',    test: (l) => /from\s+['"]rosbridge['"]/.test(l) },
  { label: 'no roslibjs import',     test: (l) => /from\s+['"]roslibjs['"]/.test(l) },
  { label: 'no infrastructure import', test: (l) => /from\s+['"][^'"]*\/infrastructure\//.test(l) },
  { label: 'no ui import',           test: (l) => /from\s+['"][^'"]*\/ui\//.test(l) },
  { label: 'no React import',        test: (l) => /from\s+['"]react(\/|['"])/.test(l) },
  { label: 'no Three.js import',     test: (l) => /from\s+['"]three(\/[^'"]*)?['"]/.test(l) },
  { label: 'no Phaser import',       test: (l) => /from\s+['"]phaser['"]/.test(l) },
  { label: 'no WebSocket import',    test: (l) => /from\s+['"][^'"]*websocket['"]/.test(l) },
  { label: 'no node:fs import',      test: (l) => /from\s+['"]node:fs['"]/.test(l) },
]

const sourceFiles = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('architecture: simulation/sensors module boundaries', () => {
  const entries = Object.entries(sourceFiles).filter(
    ([path]) => !path.endsWith('.test.ts'),
  )

  it('contains at least one source file', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  for (const [path, source] of entries) {
    for (const rule of FORBIDDEN_PATTERNS) {
      it(`${path} — ${rule.label}`, () => {
        const lines = source.split('\n')
        const offending = lines.filter(
          (line) => /^\s*import\b/.test(line) && rule.test(line),
        )
        expect(offending, `Forbidden imports detected in ${path}`).toEqual([])
      })
    }
  }
})
