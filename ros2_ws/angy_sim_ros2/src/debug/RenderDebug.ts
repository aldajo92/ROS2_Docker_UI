/**
 * Cross-cutting render diagnostics.
 *
 * This module is the single place that decides whether render-pipeline
 * debug logs are emitted. It is intentionally a leaf utility — it
 * imports nothing else from the codebase, so any layer (simulation,
 * infrastructure, UI) can use it without crossing a layer boundary.
 *
 * The on/off switch lives entirely in the UI: the
 * "Render pipeline debug logging" section of the Inspector toggles
 * {@link setRenderDebugEnabled}. There is intentionally no env var
 * and no global console helper — keeping a single surface area means
 * one less place where the flag can drift out of sync with the UI
 * indicator.
 *
 * Throttling: every "noisy" call site uses {@link throttledLog} or a
 * {@link FrameTracker} so that even at 60 Hz we emit at most ~1 line
 * per prefix per second. The browser console can keep up with that
 * indefinitely.
 *
 * Errors and warnings: errors are *always* logged, regardless of the
 * flag, because we never want to silently swallow a render exception.
 * Warnings only print when the flag is on (they're typically threshold
 * crossings, e.g. "path exceeded 5000 points").
 *
 * In-memory ring buffer: every emitted line is also appended to a
 * bounded ring buffer. The Inspector exposes Export / Clear buttons
 * that materialise the buffer as a JSON download — same UX as the
 * existing trajectory debug exporter. Capture only happens while
 * debug logging is enabled, so disabling it freezes the buffer for
 * forensic analysis without accruing more entries.
 */

const DEFAULT_THROTTLE_MS = 1000
const BUFFER_CAPACITY = 10_000

/** A single captured log line. Mirrors what was sent to the console. */
export interface RenderDebugLogEntry {
  /** Wall-clock ms (`performance.now()` if available, else `Date.now()`). */
  timestampMs: number
  /** Same instant as ISO-8601 wall-clock for grep / human reading. */
  timestampIso: string
  /** Tag — `TopicData` / `Tick` / `ThreeRenderer` / `ThreePath`. */
  prefix: RenderDebugPrefix
  /** Console method that was used (`log` / `warn` / `error`). */
  level: 'log' | 'warn' | 'error'
  /** Human-readable, single-line summary (matches console output). */
  message: string
  /** Structured payload, if any args were objects/arrays. */
  data?: unknown
}

/** Shape of the JSON payload produced by {@link getRenderDebugLog}. */
export interface RenderDebugLogExport {
  exportedAtIso: string
  exportedAtMs: number
  /** Window between the first and last captured entry, in milliseconds. */
  windowMs: number
  entryCount: number
  bufferCapacity: number
  /** Number of entries dropped from the front of the buffer. */
  droppedFromFront: number
  meta: {
    userAgent?: string
    href?: string
    debugEnabled: boolean
    intervalMs: number
  }
  entries: RenderDebugLogEntry[]
}

const lastLogAtByKey = new Map<string, number>()
let enabled = false

/* -- Ring buffer ------------------------------------------------------ */

const logBuffer: RenderDebugLogEntry[] = []
let droppedFromFront = 0

/**
 * `true` when render-debug logging is on. The flag is owned by the
 * Inspector toggle in `RendererSettingsPanel` (wired through
 * `App.tsx`); no other surface area sets it.
 */
export function isRenderDebugEnabled(): boolean {
  return enabled
}

/**
 * Flip render-debug logging on/off. Called from the React handler
 * behind the Inspector checkbox.
 */
export function setRenderDebugEnabled(value: boolean): void {
  enabled = value
}

/**
 * Read the throttle interval used by {@link throttledLog} and the
 * frame tracker. Constant by design — there is no runtime knob — so
 * downstream systems (e.g. `ExternalPathRenderSystem`) can size their
 * own per-window aggregates against the same value.
 */
export function getRenderDebugIntervalMs(): number {
  return DEFAULT_THROTTLE_MS
}

/* -- Logging primitives ------------------------------------------------ */

/**
 * Always-on log (still gated by the flag). Use this for one-shot
 * lifecycle events (mount / unmount / first-message) that fire at a
 * bounded rate.
 */
export function dlog(prefix: RenderDebugPrefix, ...args: unknown[]): void {
  if (!isRenderDebugEnabled()) return
  console.log(`[${prefix}]`, ...args)
  capture(prefix, 'log', args)
}

/**
 * Warning. Gated by the flag — these are "soft" signals (threshold
 * crossings, suspicious-but-not-fatal payloads). Hard problems use
 * {@link derror} or {@link safeRun}.
 */
export function dwarn(prefix: RenderDebugPrefix, ...args: unknown[]): void {
  if (!isRenderDebugEnabled()) return
  console.warn(`[${prefix}]`, ...args)
  capture(prefix, 'warn', args)
}

/**
 * Error. **Always** prints, regardless of the debug flag — we never
 * want to silently lose a stack trace from the render pipeline. The
 * ring buffer, however, only records when debug is enabled (consistent
 * with the rest of the API).
 */
export function derror(prefix: RenderDebugPrefix, ...args: unknown[]): void {
  console.error(`[${prefix}]`, ...args)
  if (isRenderDebugEnabled()) capture(prefix, 'error', args)
}

/**
 * Throttled log: drops calls that fire within `intervalMs` of the
 * previous emit for the same `key`. The callback is only invoked when
 * we're about to emit, so building the message is cheap when
 * throttled.
 *
 * The factory may return either a string or an array of args; both
 * are forwarded to `console.log`.
 */
export function throttledLog(
  prefix: RenderDebugPrefix,
  key: string,
  factory: () => string | unknown[],
  intervalMs: number = DEFAULT_THROTTLE_MS,
): void {
  if (!isRenderDebugEnabled()) return
  const now = nowMs()
  const last = lastLogAtByKey.get(key) ?? 0
  if (now - last < intervalMs) return
  lastLogAtByKey.set(key, now)
  const payload = factory()
  const args = Array.isArray(payload) ? payload : [payload]
  console.log(`[${prefix}]`, ...args)
  capture(prefix, 'log', args)
}

/**
 * Wrap a synchronous block in a try/catch and log a stack trace if it
 * throws. Returns the value (or `undefined` on failure) so callers can
 * easily early-exit:
 *
 *     const ok = safeRun('ThreeRenderer', 'render', () => renderer.render(state))
 *     if (!ok) return
 *
 * The catch block re-emits a *single* error per `(prefix, label)` pair
 * per second — we don't want a per-tick exception loop to swamp the
 * console.
 */
export function safeRun<T>(
  prefix: RenderDebugPrefix,
  label: string,
  fn: () => T,
): T | undefined {
  try {
    return fn()
  } catch (err) {
    const key = `safeRun:${prefix}:${label}`
    const now = nowMs()
    const last = lastLogAtByKey.get(key) ?? 0
    // Always log the FIRST exception. Subsequent ones throttled.
    if (last === 0 || now - last >= 1000) {
      lastLogAtByKey.set(key, now)
      derror(prefix, `${label} threw:`, err)
    }
    return undefined
  }
}

/* -- Frame / FPS tracker ---------------------------------------------- */

/**
 * Simple frame counter. Call `tick()` from the render-loop entry
 * point. Every {@link DEFAULT_THROTTLE_MS} milliseconds the tracker
 * emits a `[prefix] fps=… frames=… interval=…` line so you can
 * confirm the loop is alive.
 *
 * `cumulative` returns the lifetime frame count, useful when grepping
 * a long-running session.
 */
export interface FrameTracker {
  tick(): void
  cumulative(): number
}

export function makeFrameTracker(
  prefix: RenderDebugPrefix,
  loopName: string,
): FrameTracker {
  let cumulative = 0
  let windowFrames = 0
  let windowStart = nowMs()
  return {
    tick(): void {
      cumulative += 1
      windowFrames += 1
      if (!isRenderDebugEnabled()) return
      const now = nowMs()
      const elapsed = now - windowStart
      if (elapsed < DEFAULT_THROTTLE_MS) return
      const fps = (windowFrames * 1000) / Math.max(elapsed, 1)
      const msg = `loop="${loopName}" fps=${fps.toFixed(1)} frames=${windowFrames} elapsedMs=${elapsed.toFixed(0)} cumulative=${cumulative}`
      console.log(`[${prefix}]`, msg)
      capture(prefix, 'log', [msg])
      windowFrames = 0
      windowStart = now
    },
    cumulative(): number {
      return cumulative
    },
  }
}

/* -- In-memory log buffer (file-export companion) --------------------- */

/**
 * Snapshot of the captured debug log. Pure data — safe to JSON.stringify.
 *
 * The structure mirrors the `trajectory-debug-*.json` exporter:
 * a header (timestamps + meta) followed by an `entries` array.
 */
export function getRenderDebugLog(): RenderDebugLogExport {
  const exportedAtMs = nowMs()
  const first = logBuffer[0]?.timestampMs
  const last = logBuffer[logBuffer.length - 1]?.timestampMs
  const windowMs = first !== undefined && last !== undefined ? last - first : 0
  const meta: RenderDebugLogExport['meta'] = {
    debugEnabled: isRenderDebugEnabled(),
    intervalMs: DEFAULT_THROTTLE_MS,
  }
  const nav = (globalThis as unknown as { navigator?: { userAgent?: string } })
    .navigator
  if (nav?.userAgent) meta.userAgent = nav.userAgent
  const loc = (globalThis as unknown as { location?: { href?: string } })
    .location
  if (loc?.href) meta.href = loc.href

  return {
    exportedAtIso: new Date(Date.now()).toISOString(),
    exportedAtMs,
    windowMs,
    entryCount: logBuffer.length,
    bufferCapacity: BUFFER_CAPACITY,
    droppedFromFront,
    meta,
    // Defensive copy so consumers can mutate without poisoning the
    // live buffer (matches the trajectory recorder's contract).
    entries: logBuffer.map((e) => ({ ...e })),
  }
}

/** Drop every captured entry. Throttle/counter state is left intact. */
export function clearRenderDebugLog(): void {
  logBuffer.length = 0
  droppedFromFront = 0
}

/**
 * Serialise the current buffer as a JSON Blob and trigger a browser
 * download. Returns `false` in non-browser environments so tests can
 * still call this safely.
 */
export function downloadRenderDebugLog(filename?: string): boolean {
  const doc = (
    globalThis as unknown as {
      document?: {
        createElement: (tag: string) => HTMLAnchorElement
        body: { appendChild: (n: Node) => void }
      }
      URL?: {
        createObjectURL: (b: Blob) => string
        revokeObjectURL: (u: string) => void
      }
      Blob?: typeof Blob
    }
  )
  if (!doc.document || !doc.URL || !doc.Blob) return false
  const payload = getRenderDebugLog()
  const blob = new doc.Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = doc.URL.createObjectURL(blob)
  const anchor = doc.document.createElement('a') as HTMLAnchorElement
  anchor.href = url
  anchor.download = filename ?? `render-debug-${Date.now()}.json`
  doc.document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  doc.URL.revokeObjectURL(url)
  return true
}

/* -- Internals -------------------------------------------------------- */

/**
 * Append a single entry to the ring buffer. Splits args into a
 * human-readable summary (`message`) and the original structured
 * payload (`data`) so consumers can choose either view.
 */
function capture(
  prefix: RenderDebugPrefix,
  level: 'log' | 'warn' | 'error',
  args: unknown[],
): void {
  const ts = nowMs()
  const message = formatArgs(args)
  const entry: RenderDebugLogEntry = {
    timestampMs: ts,
    timestampIso: new Date(Date.now()).toISOString(),
    prefix,
    level,
    message,
  }
  // Keep the raw args only when at least one is non-string (objects,
  // arrays, errors) — for the common case where every arg is a
  // pre-formatted string we already have everything in `message`.
  if (args.some((a) => typeof a !== 'string')) {
    entry.data = args.map(serialiseArg)
  }
  logBuffer.push(entry)
  while (logBuffer.length > BUFFER_CAPACITY) {
    logBuffer.shift()
    droppedFromFront += 1
  }
}

/** Cheap stringifier for log args — avoids deep recursion on big payloads. */
function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/** Convert a single arg into something JSON.stringify-safe. */
function serialiseArg(a: unknown): unknown {
  if (a instanceof Error) {
    return { name: a.name, message: a.message, stack: a.stack }
  }
  if (typeof a === 'function') return `[function ${a.name || 'anon'}]`
  return a
}

/* -- Memory snapshot -------------------------------------------------- */

/**
 * Best-effort heap-usage snapshot from `performance.memory` (Chrome /
 * Edge only). Returns `undefined` everywhere else. Numbers are in
 * megabytes.
 */
export function readMemoryMB():
  | { usedMB: number; totalMB: number; limitMB: number }
  | undefined {
  const perf = (
    globalThis as unknown as {
      performance?: {
        memory?: {
          usedJSHeapSize?: number
          totalJSHeapSize?: number
          jsHeapSizeLimit?: number
        }
      }
    }
  ).performance
  const m = perf?.memory
  if (!m) return undefined
  const used = m.usedJSHeapSize ?? 0
  const total = m.totalJSHeapSize ?? 0
  const limit = m.jsHeapSizeLimit ?? 0
  if (used === 0 && total === 0 && limit === 0) return undefined
  return {
    usedMB: used / (1024 * 1024),
    totalMB: total / (1024 * 1024),
    limitMB: limit / (1024 * 1024),
  }
}

/* -- Prefix tag + clock ------------------------------------------------ */

export type RenderDebugPrefix =
  | 'TopicData'
  | 'Tick'
  | 'ThreeRenderer'
  | 'ThreePath'

function nowMs(): number {
  const perf = (
    globalThis as unknown as { performance?: { now?: () => number } }
  ).performance
  return perf?.now?.() ?? Date.now()
}

