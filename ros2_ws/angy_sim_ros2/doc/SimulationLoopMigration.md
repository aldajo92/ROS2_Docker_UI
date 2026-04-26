# SimulationLoop migration plan

> **Status:** *Deferred*. Do not execute any stage before measuring
> performance and visual quality with a real renderer attached.
> See *Trigger criteria* below for when to start.
>
> **Owner of execution:** whoever picks up the first renderer
> integration (Three.js, Phaser, Pixi, Canvas2D, …).

This document captures the agreed migration of the simulator's loop
and timing layer from a `setInterval`-driven engine to a host-driven
engine with a fixed-step accumulator. The current loop is correct for
a headless / no-renderer simulator; the migration only becomes
necessary once a real renderer is attached and visual smoothness or
wall-clock alignment matters.

## Goals

- Decouple **simulation time** from **rendering frame rate** without
  losing fixed-step determinism.
- Align rendering with vsync (`requestAnimationFrame`) when running in
  a browser, while preserving a `setInterval`-style driver for Node
  tests and headless harnesses.
- Keep `src/simulation/` and `src/math/` free of imports from React,
  Three.js, Phaser, Pixi, Canvas, or DOM rendering APIs.
- Keep the engine's public event surface (`tick`, `started`, `paused`,
  `reset`, `scenarioLoaded`, `collision`, `entityAdded`,
  `entityRemoved`) unchanged. **No new `render` event on the engine.**

## Non-goals

- Rewriting the engine, math, entities, systems, scenarios, or React
  UI.
- Adding interpolation between sim states (only happens in stage 4 if
  measurably needed).
- Worker-hosting the engine. Out of scope; revisit only if the engine
  starves the main thread under real load.

## Current state (baseline)

- `SimulationLoop` uses `setInterval` with `realIntervalMs =
  (fixedDtSec * 1000) / speedFactor` and calls `engine.tick(fixedDtSec)`
  on each fire.
- `SimulationEngine.tick(dt)` is **private**; the only external
  drivers are `engine.step(dt?)` (manual step, ignored while loop is
  running) and the loop itself.
- `SimulationClock.tick(dt)` is the only place sim time advances. No
  accumulator.
- `SimulationRenderer` is interface-only — no concrete renderer yet.

Implications:

- Sim time advances by exactly `fixedDtSec` per fire regardless of how
  late the timer was → **wall clock and sim clock drift silently**.
- `setInterval` is throttled to ≥ 1000 ms in inactive tabs; rAF is
  paused entirely. Either way, the engine "freezes" while the tab is
  inactive and resumes from the next event.
- `setInterval` has no phase relationship to vsync. With a future
  renderer drawing on rAF, this will alias as visible jitter.

## Trigger criteria — when to start

Begin the migration when **any** of the following becomes true after
attaching a renderer:

1. Visible jitter / stutter in the rendered scene at steady-state
   (entities appear to "pulse" or skip frames at constant velocity).
2. Wall-clock divergence matters (e.g. ROS bridge, recorded data,
   user expects "5 simulated seconds" to be 5 wall-clock seconds).
3. Tab-switch / GC pause produces multi-second freezes the user
   notices.
4. Renderer perf budget is tight enough that you want to render more
   often than you simulate, or vice versa.

Until then, **do nothing**. The current `setInterval` loop is fine
without a renderer, and refactoring speculatively risks regressions
in code paths that aren't currently exercised.

## Architecture target

The loop moves **out** of `SimulationEngine`. The engine becomes a
passive object that exposes `step(dt)` and `state`. A *host adapter*
(browser rAF in production, timer-based in Node tests) drives both
the engine and the renderer.

```
┌──────────────────────────────────────────────────────────────────┐
│ src/app/  (React shell — browser only)                           │
│   SimulationProvider                                             │
│      ├── builds → SimulationEngine                               │
│      ├── builds → BrowserHostLoop  (rAF + accumulator + clamp)   │
│      └── (when renderer is added) → SimulationRenderer instance  │
└──────────────────────────────────────────────────────────────────┘
        │ engine.step(dt)               │ renderer.render(state)
        ▼                               ▼
┌────────────────────────────┐  ┌─────────────────────────────────┐
│ src/simulation/  (core)    │  │ src/render/<lib>/  (adapter)    │
│  - SimulationEngine        │  │  - Renderer implements          │
│  - SimulationClock         │  │    SimulationRenderer           │
│  - HostLoop interface      │  │  - reads SimulationState,       │
│  - BrowserHostLoop         │  │    never mutates                │
│  - TimerHostLoop           │  │  - mounts its own canvas        │
│  - NO React, NO Three.js   │  │                                 │
└────────────────────────────┘  └─────────────────────────────────┘
```

Single dependency direction: **React → HostLoop → { Engine, Renderer }**.
Engine and Renderer never depend on each other; the host loop is the
only thing that calls both.

## Target interfaces

Place under `src/simulation/core/`. They use `requestAnimationFrame` /
`performance.now` only — both are standard Web/Node APIs and do **not**
import any rendering or React code, so the rendering-agnostic
constraint is preserved. Both clocks are also constructor-injectable
for testability.

```ts
export interface HostLoop {
  start(): void
  pause(): void
  isRunning(): boolean
  setSpeedFactor(factor: number): void
  /** Manually advance one step; ignored if the loop is running. */
  stepOnce(): void
}

export interface BrowserHostLoopOptions {
  fixedDtSec: number
  speedFactor?: number
  /** Maximum real-frame dt fed into the accumulator (s). Default 0.1. */
  maxFrameDtSec?: number
  onStep: (dt: number) => void
  /** Called once per animation frame, after any sim steps. `alpha`
   *  is `accumulator / fixedDtSec` ∈ [0, 1) for future interpolation;
   *  renderers without interpolation simply ignore it. */
  onRender?: (alpha: number) => void
  /** Injectable for tests. Default: globalThis.performance.now. */
  now?: () => number
  /** Injectable for tests. Default: globalThis.requestAnimationFrame. */
  requestFrame?: (cb: (nowMs: number) => void) => number
  cancelFrame?: (handle: number) => void
}

export class BrowserHostLoop implements HostLoop { /* … */ }

export interface TimerHostLoopOptions {
  fixedDtSec: number
  speedFactor?: number
  onStep: (dt: number) => void
}

export class TimerHostLoop implements HostLoop { /* … */ }
```

`SimulationEngine` exposes `step(dt)` publicly:

```ts
export class SimulationEngine {
  readonly state: SimulationState
  readonly events: TypedEventBus<SimulationEvents>
  readonly fixedDtSec: number

  step(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return
    this.clock.tick(dt)
    this.systems.update(dt, this.state)
    this.state.metrics.ticks += 1
    this.events.emit('tick', {
      time: this.clock.time(),
      dt,
      ticks: this.state.metrics.ticks,
    })
  }

  loadScenario(spec: ScenarioSpec): void { /* unchanged */ }
  reset(): void { /* unchanged */ }
}
```

The `SimulationLoop` class is removed (or kept as a deprecated
re-export of `TimerHostLoop` for one cycle).

## Reference implementations

### `BrowserHostLoop` (rAF + accumulator + clamp)

```ts
export class BrowserHostLoop implements HostLoop {
  private running = false
  private rafHandle = 0
  private lastNowMs = 0
  private accumulator = 0
  private speedFactor: number
  private readonly fixedDtSec: number
  private readonly maxFrameDtSec: number
  private readonly onStep: (dt: number) => void
  private readonly onRender?: (alpha: number) => void
  private readonly now: () => number
  private readonly raf: (cb: (n: number) => void) => number
  private readonly cancel: (h: number) => void

  constructor(opts: BrowserHostLoopOptions) {
    this.fixedDtSec = opts.fixedDtSec
    this.speedFactor = opts.speedFactor ?? 1
    this.maxFrameDtSec = opts.maxFrameDtSec ?? 0.1
    this.onStep = opts.onStep
    this.onRender = opts.onRender
    this.now = opts.now ?? (() => performance.now())
    this.raf = opts.requestFrame ?? requestAnimationFrame.bind(globalThis)
    this.cancel = opts.cancelFrame ?? cancelAnimationFrame.bind(globalThis)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastNowMs = this.now()
    this.accumulator = 0
    const loop = (nowMs: number) => {
      if (!this.running) return
      const rawDt = (nowMs - this.lastNowMs) / 1000
      this.lastNowMs = nowMs
      const frameDt = Math.min(rawDt, this.maxFrameDtSec) * this.speedFactor
      this.accumulator += frameDt

      while (this.accumulator + 1e-9 >= this.fixedDtSec) {
        this.onStep(this.fixedDtSec)
        this.accumulator -= this.fixedDtSec
      }

      const alpha = this.accumulator / this.fixedDtSec
      this.onRender?.(alpha)

      this.rafHandle = this.raf(loop)
    }
    this.rafHandle = this.raf(loop)
  }

  pause(): void {
    if (!this.running) return
    this.running = false
    this.cancel(this.rafHandle)
  }

  isRunning(): boolean {
    return this.running
  }

  setSpeedFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`BrowserHostLoop.setSpeedFactor: must be > 0, got ${factor}`)
    }
    this.speedFactor = factor
  }

  stepOnce(): void {
    if (this.running) return
    this.onStep(this.fixedDtSec)
    this.onRender?.(0)
  }
}
```

### `TimerHostLoop` (Node-friendly drop-in for the current loop)

```ts
export class TimerHostLoop implements HostLoop {
  private handle: ReturnType<typeof setInterval> | null = null
  private speedFactor: number
  private readonly fixedDtSec: number
  private readonly onStep: (dt: number) => void

  constructor(opts: TimerHostLoopOptions) {
    this.fixedDtSec = opts.fixedDtSec
    this.speedFactor = opts.speedFactor ?? 1
    this.onStep = opts.onStep
  }

  start(): void {
    if (this.handle) return
    const ms = (this.fixedDtSec * 1000) / this.speedFactor
    this.handle = setInterval(() => this.onStep(this.fixedDtSec), ms)
  }

  pause(): void {
    if (!this.handle) return
    clearInterval(this.handle)
    this.handle = null
  }

  isRunning(): boolean { return this.handle !== null }

  setSpeedFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new Error(`TimerHostLoop.setSpeedFactor: must be > 0, got ${factor}`)
    }
    const wasRunning = this.isRunning()
    this.speedFactor = factor
    if (wasRunning) { this.pause(); this.start() }
  }

  stepOnce(): void {
    if (this.handle) return
    this.onStep(this.fixedDtSec)
  }
}
```

### Provider wiring

```tsx
// src/app/SimulationProvider.tsx (sketch)
const engineRef = useRef<SimulationEngine>()
const loopRef = useRef<HostLoop>()
const rendererRef = useRef<SimulationRenderer>()

useEffect(() => {
  const engine = new SimulationEngine({ fixedDtSec: 1/60 })
  // … register systems …
  const renderer = new ThreeRenderer({ mount: canvasRef.current })
  renderer.init(engine.state)

  const loop = new BrowserHostLoop({
    fixedDtSec: engine.fixedDtSec,
    maxFrameDtSec: 0.1,
    onStep:   (dt) => engine.step(dt),
    onRender: ()   => renderer.render(engine.state),
  })

  engineRef.current = engine
  loopRef.current = loop
  rendererRef.current = renderer

  return () => {
    loop.pause()
    renderer.dispose()
  }
}, [])
```

## Stages

Each stage is independent and can land as a separate PR. **Do not
combine stages.** Land stage 1, watch the engine for at least one
session of real use, then move to stage 2.

### Stage 1 — Add the first renderer **without touching the loop**

Goal: validate the renderer-as-consumer contract without doing two
refactors at once.

Deliverables:
- Concrete renderer implementation under `src/render/<lib>/` (e.g.
  `src/render/three/ThreeRenderer.ts`). Implements
  `SimulationRenderer`. Imports rendering libs only here — never in
  `src/simulation/` or `src/math/`.
- A new React component (e.g. `<RendererCanvas />`) under `src/ui/`
  that mounts the renderer in `useEffect` and triggers
  `renderer.render(engine.state)` on each `tick` event from the
  engine.
- `SimulationProvider` unchanged except for instantiating the
  renderer alongside the engine.

Acceptance:
- Scene renders, entities appear at correct positions.
- Loading a scenario calls `renderer.init` again or the renderer
  reflects the entity-add events for the new entities.
- `reset` clears the scene cleanly; `dispose` releases GPU resources
  and event subscriptions.
- All existing tests still pass; no changes to `src/simulation/`.

Known limitation accepted in stage 1: rendering is on the
`setInterval` cadence, **not** vsync. Some jitter is expected — that
is the baseline for stage 2.

### Stage 2 — Introduce host loops; engine becomes timing-agnostic

Goal: rendering moves to vsync; sim stays fixed-step under an
accumulator; tab-inactivity catch-up is bounded.

Deliverables:
- `HostLoop` interface, `BrowserHostLoop`, `TimerHostLoop` under
  `src/simulation/core/`.
- `SimulationEngine.step(dt)` becomes public; `SimulationEngine` no
  longer owns a `SimulationLoop`. `SimulationEngine.start / pause /
  step` either delegate to a host loop passed in via constructor *or*
  are removed entirely (preferred — let the provider own the loop).
- `SimulationLoop` class removed (or kept as a one-line re-export
  alias of `TimerHostLoop` with an `@deprecated` JSDoc, deleted in
  the next cycle).
- `SimulationProvider` builds `BrowserHostLoop` and wires
  `engine.step` + `renderer.render`.
- `maxFrameDtSec` defaults to `0.1` (5 ms over 6 × `fixedDt` at
  60 Hz). Document the tradeoff: time after long pauses is
  intentionally dropped.

Acceptance:
- Steady-state rendering at constant velocity is visibly smoother
  than stage 1.
- Tab-switch test: switch to another tab for ≥ 30 s, return — the
  sim resumes without a multi-second catch-up burst.
- All existing tests pass with `TimerHostLoop` substituted for the
  old `SimulationLoop`.
- New unit tests for `BrowserHostLoop` using injected `now` and
  `requestFrame`:
  - 5 ms frames → no sim step (accumulator < `fixedDt`).
  - 16.67 ms frames → 1 sim step per frame (steady state).
  - 50 ms frame → 3 sim steps + 1 render in that frame.
  - 5 s frame → clamped to `maxFrameDtSec`; ≤ 6 sim steps.

### Stage 3 — Formalize the alpha contract

Goal: document and expose the interpolation alpha for the renderer
to use later.

Deliverables (no engine code change):
- `BrowserHostLoop.onRender(alpha)` already passes the value; this
  stage just nails down what it means and updates
  `SimulationRenderer.render` to optionally accept it:

  ```ts
  render(state: SimulationState, alpha?: number): void
  ```

- `Architecture.md` and `Considerations.md` updated to describe the
  alpha semantics. Add a note: "renderers without interpolation
  ignore alpha; engine remains the source of truth for state."

Acceptance:
- Type-only change. All existing renderers still type-check by
  ignoring the new parameter.

### Stage 4 — *Optional* renderer-side interpolation

**Skip unless** you measurably see stutter at sim < render rate (e.g.
30 Hz sim on a 144 Hz monitor) or the user explicitly requests it.

Deliverables:
- The renderer (not the engine) caches the previous frame's pose for
  each entity it tracks.
- `render(state, alpha)` lerps between cached and current pose.
- No engine change. No state duplication in the engine.

Acceptance:
- Stutter at sim < render disappears in side-by-side comparison.
- Engine determinism unchanged (same scenario produces the same
  metric values).

### Stage 5 — UI subscription throttling

Goal: prevent telemetry-heavy components (charts, dense readouts)
from re-rendering on every sim tick when the user can't perceive the
difference.

Deliverables:
- A `useThrottledSimulationTime(everyNTicks)` hook (or a generic
  `useThrottledSimEvent(event, everyN)`) that wraps the existing
  `useSyncExternalStore` plumbing and only emits an update every N
  ticks. Pattern reference:
  `angelos_sim_ros2/src/useSimTick.tsx`'s `useChartTick(frequency)`.
- Consumer updates: charts and any high-frequency text readout swap
  to the throttled hook. Engine-level events unchanged.

Acceptance:
- Profiler shows fewer React commits per second when telemetry is
  visible. No change in displayed values' correctness (just
  granularity).

## Risks & trade-offs

- **`maxFrameDtSec` silently drops time** after long pauses. Correct
  for a real-time renderer, wrong for a deterministic batch run. For
  batch / replay use `TimerHostLoop` or call `engine.step(dt)`
  directly in a loop.
- **Sub-`fixedDt` lag** is inherent to the accumulator. With
  `fixedDt = 16.67 ms` the lag is at most one frame; imperceptible.
- **Render < sim rate** (e.g. heavy GPU frame) → accumulator grows →
  multiple sim steps per next frame. Clamping handles the
  catastrophic case but doesn't solve "render is consistently
  slower than sim". Mitigation: increase `fixedDtSec` to match
  achievable render rate, or move to a Worker-hosted engine
  (out of scope here).
- **Determinism caveat**: with rAF + wall clock, running the same
  scenario at different real speeds produces different *real* total
  number of frames. Ticks per scenario remain deterministic because
  the engine still advances by exactly `fixedDtSec` per step.
- **Stage-2 public-surface change**: `SimulationEngine.step(dt)`
  becoming public + ownership of the loop moving to the provider is
  a one-PR breaking change. Mitigated by the deprecation alias.
- **`BrowserHostLoop` is not pure-Node** because it expects rAF.
  This is fine — Node tests use `TimerHostLoop` or call
  `engine.step(dt)` directly. The constructor-injectable
  `requestFrame` makes `BrowserHostLoop` itself unit-testable
  without a browser.

## Rollback / abort

Stages 1, 2, 3 are independently revertible:

- Reverting stage 1: drop the `<RendererCanvas />` component and the
  `src/render/` adapter. Engine is unchanged.
- Reverting stage 2: restore `SimulationLoop`, restore
  `SimulationEngine.start/pause/step` ownership of the loop, switch
  the provider back to engine-driven start.
- Reverting stage 3: drop the `alpha` parameter in
  `SimulationRenderer.render`. Type-only change.

Stages 4 and 5 are local to the renderer and the React UI
respectively; reverting either is local-file-scope.

## Out of scope (explicitly)

- **Worker-hosted engine.** Revisit if the engine starves the main
  thread under real load.
- **Networked / shared simulation.** No clock synchronization across
  hosts.
- **Real-time guarantees.** Browser rAF + setTimeout is best-effort,
  not RT.
- **Multi-renderer scenarios** (e.g. two renderers simultaneously).
  Allowed by the interface but not validated in this plan.

## Cross-references

- `Architecture.md` — overall project architecture; `BrowserHostLoop`
  slots into the Layer 2 (simulation core) section.
- `Considerations.md` — handedness and unit conventions; not affected
  by this migration but the renderer adapters introduced in stage 1
  must respect them.
- `src/simulation/core/SimulationLoop.ts` — current `setInterval`
  loop being migrated.
- `src/simulation/core/SimulationEngine.ts` — current engine,
  `tick(dt)` becomes public `step(dt)` in stage 2.
- `src/simulation/render/SimulationRenderer.ts` — interface that
  stage-1 renderers implement; gains optional `alpha` in stage 3.
