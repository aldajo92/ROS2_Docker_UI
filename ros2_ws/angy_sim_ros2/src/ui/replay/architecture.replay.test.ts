import { describe, expect, it } from 'vitest'

const replayUiTsSources = import.meta.glob('./*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const replayUiTsxSources = import.meta.glob('./*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const replayUiSources: Record<string, string> = {
  ...replayUiTsSources,
  ...replayUiTsxSources,
}

const simulationRecordingSources = import.meta.glob(
  '../../simulation/recording/*.ts',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const otherUiSources = import.meta.glob('../*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const otherUiTsxSources = import.meta.glob('../*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function importLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => /^\s*import\b/.test(line))
}

describe('architecture: src/ui/replay/** boundaries', () => {
  const replayEntries = Object.entries(replayUiSources).filter(
    ([path]) => !path.endsWith('.test.ts'),
  )

  it('contains the expected source files', () => {
    expect(replayEntries.length).toBeGreaterThan(0)
  })

  for (const [path, source] of replayEntries) {
    it(`${path} — must not import the SimulationRecorder class`, () => {
      const offending = importLines(source).filter((l) =>
        /SimulationRecorder['"]/.test(l),
      )
      expect(offending).toEqual([])
    })

    it(`${path} — must not import SimulationRecorderSystem`, () => {
      const offending = importLines(source).filter((l) =>
        /SimulationRecorderSystem/.test(l),
      )
      expect(offending).toEqual([])
    })

    it(`${path} — imports from simulation/recording are limited to the public surface`, () => {
      // Allowed sibling modules:
      //  - ReplayFormat / SimulationFrameSnapshot: shared schema types
      //  - ReplaySession: pure-logic playback cursor, consumed by
      //    ReplayPlayer
      //  - createReplayStateFromFrame: read-only adapter; UI never
      //    imports it directly today, but if a future component
      //    needs the adapter the App shell remains the canonical
      //    wiring point. Keeping it on the allowlist documents
      //    intent.
      const offending = importLines(source).filter(
        (l) =>
          /from\s+['"][^'"]*\/simulation\/recording\/(?!ReplayFormat|SimulationFrameSnapshot|ReplaySession|createReplayStateFromFrame)/.test(
            l,
          ),
      )
      expect(offending).toEqual([])
    })
  }
})

describe('architecture: src/simulation/recording/** must not import src/ui/replay/**', () => {
  for (const [path, source] of Object.entries(simulationRecordingSources)) {
    if (path.endsWith('.test.ts')) continue
    it(`${path} — no ui/replay imports`, () => {
      const offending = importLines(source).filter((l) =>
        /from\s+['"][^'"]*\/ui\/replay\//.test(l),
      )
      expect(offending).toEqual([])
    })
  }
})

describe('architecture: dumb UI panels do not import the downloader', () => {
  // Sibling UI files under `src/ui/*` (panels, viewports, hooks) are
  // dumb / controlled components. They must not import
  // `ReplayFileDownloader` — only the App shell wires the download
  // side effect. The shell lives under `src/app/` and is intentionally
  // outside this glob.
  const offenders: string[] = []
  const inspect = (path: string, source: string) => {
    if (
      /from\s+['"][^'"]*\/ui\/replay\/ReplayFileDownloader['"]/.test(source)
    ) {
      offenders.push(path)
    }
  }
  for (const [path, source] of Object.entries(otherUiSources)) {
    inspect(path, source)
  }
  for (const [path, source] of Object.entries(otherUiTsxSources)) {
    inspect(path, source)
  }

  it('no sibling UI panel imports ReplayFileDownloader', () => {
    expect(offenders).toEqual([])
  })
})
