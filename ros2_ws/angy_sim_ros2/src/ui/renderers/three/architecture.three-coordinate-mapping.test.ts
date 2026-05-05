import { describe, expect, it } from 'vitest'

/**
 * Architecture guard: Three.js renderer coordinate safety.
 *
 * Rules enforced here:
 *   Renderer files must NOT use raw Three.js coordinate operations on
 *   simulation-frame data. All sim→Three conversion must go through
 *   `src/ui/renderers/three/mapping/ThreeSimTransform.ts`, which
 *   delegates to `simToThree.ts` as the single source of truth.
 *
 * Flagged patterns:
 *   - `.position.set(`      — often used with raw sim (x, y) values
 *   - `new THREE.Vector3(`  — often used to inline sim→Three formula
 *   - `.rotation.set(0, 0,` — wrong axis: sim yaw belongs on rotation.y
 *   - `.rotation.z =`       — wrong axis: sim yaw belongs on rotation.y
 *
 * Exemptions (not audited):
 *   - `mapping/` directory — canonical conversion source, by definition OK
 *   - `*.test.ts` files — test helpers are not production renderers
 *   - `createArrow.ts` — pure Three.js geometry builder, no sim data
 *
 * Files on the explicit per-file allowlist below have documented, intentional
 * raw Three.js usages that are local/Three-space, not simulation-frame data.
 * New files should either avoid these patterns or add an inline comment with
 * an exemption keyword (see EXCUSE_KEYWORDS) next to the non-sim usage.
 */

const allSources = import.meta.glob('/src/ui/renderers/three/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Files whose raw Three.js usages are intentional, local/Three-space, and
 * documented. Any violation found in these files is excused automatically.
 *
 * Reason is required so the allowlist stays self-documenting.
 */
const FILE_ALLOWLIST: Record<string, string> = {
  'BoundingOutlineRenderer.ts':
    'local mesh geometry — circlePoints and rectanglePoints build shapes ' +
    'relative to the mesh origin; the mesh is positioned via ThreeSimTransform',
  'ThreeAxesRenderer.ts':
    'local basis vector — `new THREE.Vector3(1, 0, 0)` is the local +X ' +
    'forward for quaternion alignment, not a simulation position',
  'ThreeSimulationRenderer.ts':
    'Three-space light placement — `directional.position.set(8, 12, 8)` ' +
    'is a Three.js world-space value, not simulation-frame data',
}

/**
 * Patterns that flag a potentially unsafe raw Three.js coordinate operation.
 * Each entry is checked line-by-line across all audited files.
 */
const SUSPICIOUS_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\.position\.set\(/, label: '.position.set(...)' },
  { pattern: /new THREE\.Vector3\(/, label: 'new THREE.Vector3(...)' },
  { pattern: /\.rotation\.set\(\s*0\s*,\s*0\s*,/, label: '.rotation.set(0, 0, ...)' },
  { pattern: /\.rotation\.z\s*=/, label: '.rotation.z =' },
]

/**
 * Inline comment keywords that excuse a line from the rule.
 * Add one of these next to a legitimate raw Three.js usage to suppress the
 * guard without widening the per-file allowlist.
 *
 * Examples:
 *   mesh.position.y = LIFT  // Three-space: vertical offset, not sim coord
 *   new THREE.Vector3(1, 0, 0) // local basis vector
 */
const EXCUSE_KEYWORDS = [
  'local',
  'three-space',
  'geometry',
  'light',
  'camera',
  'basis',
]

function lineIsExcused(line: string): boolean {
  const commentStart = line.indexOf('//')
  if (commentStart === -1) return false
  const comment = line.slice(commentStart).toLowerCase()
  return EXCUSE_KEYWORDS.some((kw) => comment.includes(kw))
}

const THREE_RENDERER_DIR = '/src/ui/renderers/three/'

const auditableFiles = Object.entries(allSources).filter(([path]) => {
  if (!path.startsWith(THREE_RENDERER_DIR)) return false
  if (path.endsWith('.test.ts')) return false
  if (path.includes('/mapping/')) return false
  if (path.endsWith('createArrow.ts')) return false
  return true
})

describe('architecture: Three.js renderers convert sim coordinates through ThreeSimTransform', () => {
  it('found auditable Three.js renderer source files to check', () => {
    expect(auditableFiles.length).toBeGreaterThan(0)
  })

  for (const [path, source] of auditableFiles) {
    const fileName = path.split('/').pop() ?? path
    const allowlistReason = FILE_ALLOWLIST[fileName]

    if (allowlistReason !== undefined) {
      it(`${path} — allowlisted: ${allowlistReason}`, () => {
        // Passes by definition. Present in the report so allowlist entries
        // are visible and reviewable alongside passing files.
        expect(true).toBe(true)
      })
      continue
    }

    const lines = source.split('\n')

    for (const { pattern, label } of SUSPICIOUS_PATTERNS) {
      const violations = lines
        .map((line, idx) => ({ line, lineNum: idx + 1 }))
        .filter(({ line }) => pattern.test(line) && !lineIsExcused(line))

      it(`${path} — no raw ${label} on simulation data`, () => {
        const messages = violations.map(
          ({ line, lineNum }) =>
            `  Line ${lineNum}: ${line.trim()}\n` +
            `  Fix: use ThreeSimTransform.ts helpers (setSimPosition2D, setSimPose2D,\n` +
            `       setSimYaw, simPolyline2DToThreePositions, simSegment2DToThreePoints).\n` +
            `  If this usage is genuinely local/Three-space (not sim-frame data), add\n` +
            `  an inline comment with a keyword: ${EXCUSE_KEYWORDS.join(', ')}.`,
        )
        expect(
          violations,
          `Raw Three.js coordinate operation in ${path}:\n${messages.join('\n')}`,
        ).toEqual([])
      })
    }
  }
})
