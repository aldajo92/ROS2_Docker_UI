import { describe, expect, it } from 'vitest'

/**
 * Architecture-boundary test for `roslib` isolation.
 *
 * `roslib` is a vendor dependency. Per the project's communication
 * architecture (Architecture.md, Layer 8), only
 * `src/infrastructure/communication/rosbridge/` is allowed to depend
 * on it. The simulation core (Engine, systems, bridges, adapters,
 * messages) and all other infrastructure transports must remain
 * roslib-free so we can swap rosbridge for DDS / MQTT / WebRTC /
 * native-WebSocket without touching them.
 *
 * This test enumerates every `.ts` and `.tsx` source file under
 * `src/` and asserts that:
 *
 *   1. Files outside `src/infrastructure/communication/rosbridge/`
 *      do NOT contain `import ... from 'roslib'` (or
 *      `import 'roslib'`).
 *   2. The rosbridge module itself contains at least one *runtime*
 *      import of `roslib` — proving the dependency is reachable
 *      (not silently broken).
 *
 * Implementation note: we use absolute (Vite project-root) globs so
 * the resulting keys consistently start with `/src/...`, which makes
 * the rosbridge-folder check robust. Upward-walking relative globs
 * can return sibling files with a collapsed `./` prefix, which makes
 * substring-based folder detection unreliable.
 */

const allTsSources = import.meta.glob('/src/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const allTsxSources = import.meta.glob('/src/**/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const allSources: Record<string, string> = {
  ...allTsSources,
  ...allTsxSources,
}

const ROSBRIDGE_DIR = '/src/infrastructure/communication/rosbridge/'

function isRoslibImportLine(line: string): boolean {
  return (
    /^\s*import\b[^'"]*from\s+['"]roslib['"]/.test(line) ||
    /^\s*import\s+['"]roslib['"]/.test(line)
  )
}

function importLines(source: string): string[] {
  return source.split('\n').filter((line) => /^\s*import\b/.test(line))
}

describe('architecture: roslib is isolated to src/infrastructure/communication/rosbridge/', () => {
  const entries = Object.entries(allSources).filter(
    ([path]) => !path.endsWith('.test.ts') && !path.endsWith('.test.tsx'),
  )

  it('the source-file glob picked up a non-trivial number of files', () => {
    // Sanity check: if the glob ever stops returning files, the
    // boundary check would silently pass with zero coverage.
    expect(entries.length).toBeGreaterThan(50)
  })

  for (const [path, source] of entries) {
    if (path.startsWith(ROSBRIDGE_DIR)) continue

    it(`${path} — must NOT import 'roslib'`, () => {
      const offending = importLines(source).filter(isRoslibImportLine)
      expect(
        offending,
        `Forbidden roslib import detected in ${path}. ` +
          'Move this code under src/infrastructure/communication/rosbridge/ ' +
          'or talk to the generic Transport interface instead.',
      ).toEqual([])
    })
  }

  it('at least one file inside src/infrastructure/communication/rosbridge/ does import roslib (proves the dep is reachable)', () => {
    const rosbridgeFiles = entries.filter(([path]) =>
      path.startsWith(ROSBRIDGE_DIR),
    )

    // Defensive: if the rosbridge dir disappears, surface that as a
    // clear failure rather than a silently-passing assertion.
    expect(
      rosbridgeFiles.length,
      `Expected source files under ${ROSBRIDGE_DIR}`,
    ).toBeGreaterThan(0)

    const runtimeImporters = rosbridgeFiles.filter(([, source]) =>
      importLines(source).some(
        (line) =>
          // Exclude `import type ...` — type-only imports are erased
          // at build time and don't pull `roslib` into the runtime
          // bundle. We need at least one *value* import to confirm
          // the dependency is actually wired.
          !/^\s*import\s+type\b/.test(line) && isRoslibImportLine(line),
      ),
    )
    expect(runtimeImporters.length).toBeGreaterThan(0)
  })
})
