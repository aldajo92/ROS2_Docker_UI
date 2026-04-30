import { describe, expect, it } from 'vitest'

const FORBIDDEN_PATTERNS: ReadonlyArray<{
  label: string
  test: (line: string) => boolean
}> = [
  { label: 'no node:fs import', test: (l) => /from\s+['"]node:fs['"]/.test(l) },
  { label: 'no fs import', test: (l) => /from\s+['"]fs['"]/.test(l) },
  {
    label: 'no node:path import',
    test: (l) => /from\s+['"]node:path['"]/.test(l),
  },
  {
    label: 'no React import',
    test: (l) => /from\s+['"]react(\/|['"])/.test(l),
  },
  {
    label: 'no Three.js import',
    test: (l) => /from\s+['"]three(\/[^'"]*)?['"]/.test(l),
  },
  {
    label: 'no Phaser import',
    test: (l) => /from\s+['"]phaser['"]/.test(l),
  },
  {
    label: 'no UI import',
    test: (l) => /from\s+['"][^'"]*\/ui\//.test(l),
  },
  {
    label: 'no app import',
    test: (l) => /from\s+['"][^'"]*\/app\//.test(l),
  },
]

// `import.meta.glob` is the Vite-native way to fetch sibling source
// files at test time without depending on `@types/node`. The project's
// tsconfig.app.json has no Node types; this keeps the test file
// inside the same compilation unit as the runtime code it guards.
const sourceFiles = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('architecture: recording module boundaries', () => {
  const entries = Object.entries(sourceFiles).filter(
    ([path]) => !path.endsWith('.test.ts'),
  )

  it('contains the expected source files', () => {
    expect(entries.length).toBeGreaterThan(0)
  })

  for (const [path, source] of entries) {
    for (const rule of FORBIDDEN_PATTERNS) {
      it(`${path} — ${rule.label}`, () => {
        const lines = source.split('\n')
        const offending = lines.filter(
          (line) => /^\s*import\b/.test(line) && rule.test(line),
        )
        expect(
          offending,
          `Forbidden imports detected in ${path}`,
        ).toEqual([])
      })
    }
  }
})
