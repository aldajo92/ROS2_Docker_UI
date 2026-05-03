# Architecture

`angy_sim_ros2` is a **rendering-agnostic** simulation core wrapped in a
React UI shell. The simulation has no knowledge of React, Three.js,
Phaser, Pixi, Canvas, or the DOM — it is plain TypeScript that can be
driven from any host (browser, Node, headless tests) and visualized by
any renderer that implements the `SimulationRenderer` interface.

## Goals & constraints

- **Decoupled core.** `src/simulation/` and `src/math/` import zero
  rendering or framework code. React lives only in `src/app/` and
  `src/ui/`.
- **Deterministic, fixed-step.** The engine advances on a configurable
  `fixedDtSec` (default `1/60`). All systems see the same `dt`.
- **Right-handed, SI units.** +X right, +Y forward, +Z up; meters,
  seconds, radians, m/s, rad/s. See `Considerations.md` for renderer
  handedness mapping.
- **Event-driven UI.** The React shell never polls; it subscribes to
  engine events through `useSyncExternalStore` hooks at the leaf
  components, so a tick only re-renders the components that read
  changed state.
- **Immutable math primitives.** All `Point*`, `Vector*`, `Pose*`,
  `Line2D`, `Segment2D`, and `Transform2D` instances are immutable;
  every operation returns a new instance.

## Directory layout

```
src/
  app/                React shell — providers, hooks, top-level App
  ui/
    viewport/         React mount point for the active renderer
    renderers/
      three/          Three.js renderer adapter
        core/           Coordinator, scene context, registry, disposal
        mapping/        sim ↔ three coordinate / yaw conversion
        objects/        Per-entity sub-renderers + trajectory lines from state
        cameras/        CameraController interface + modes + manager
        debug/          Bounding circles, heading arrows, etc.
        config/         ThreeRendererConfig + defaults
      phaser/         Phaser renderer adapter (2D top-down)
        core/           Coordinator, scene context, registry
        mapping/        sim ↔ phaser canvas / yaw conversion
        objects/        Per-entity sub-renderers + ground/axes
        debug/          Bounding circles, heading arrows
        config/         PhaserRendererConfig + defaults
    input/            Browser-input adapters (keyboard, …)
    *.tsx             Inspector panels (Control, Metrics, Entities, …)
  math/
    geometry/         Point/Vector/Pose/Line/Segment/Transform + ops
  simulation/
    core/             Engine, clock, loop, state, managers, controller
    entities/         Entity interface + concrete entities
    systems/          SimulationSystem interface + concrete systems
    commands/         Addressed VehicleCommand + queue + system
    scenarios/        Scenario type + JSON loader
    trajectories/     Trajectory samples + registry types (sim-owned)
    recording/        Replay format, snapshotter, recorder + system,
                      ReplaySession + replay-state adapter (Phase 3)
    events/           Typed event bus + SimulationEvents map
    logging/          Pluggable level-filtered logger
    render/           SimulationRenderer interface (no impl)
    communication/    Transport-agnostic comms contracts + bridges
      messages/         Internal JSON-friendly message types
      adapters/         JSON adapters (validation + pass-through)
      bridges/          TopicBridge implementations
    collision/        Backend-agnostic 2D collision contracts
  infrastructure/
    communication/    Concrete Transports (mock, in-memory, WebSocket, rosbridge)
    collision/
      rapier/         Optional Rapier 2D backend (WASM)
public/
  scenarios/          Sample JSON scenarios
```

## Layer 1 — math (`src/math/geometry/`)

Pure data + free-function operations.

- **Classes** (immutable, with `static` factories like `origin()`,
  `of()`, `identity()` and a `with()` for partial overrides):
  `Point2D`, `Point3D`, `Vector2D`, `Vector3D`, `Pose2D`, `Pose3D`,
  `Line2D`, `Segment2D`, `Transform2D`.
- **`operations2D.ts` / `operations3D.ts`** — free functions for
  `vectorAdd/Sub/Scale/Negate/Dot/Cross/Length/Normalize/Rotate/Angle`,
  `pointAdd/SubVector/Sub/Distance(Sq)`, `wrapAngle(rad)` (via
  `atan2(sin, cos)`), `segmentDistanceSq(seg, p)`, plus a 3D cross.
- All angular ops use the **CCW-from-+X** convention.

Math is pure: no I/O, no logging, no event bus.

## Layer 2 — simulation core (`src/simulation/core/`)

The runtime spine.

- **`SimulationClock`** — tracks `timeSec` and `lastDt`; rejects
  negative or non-finite `dt`.
- **`SimulationLoop`** — `setInterval`-driven fixed-step driver with
  `start() / pause() / stepOnce()`, configurable `fixedDtSec` and
  `speedFactor`. Calls a single registered step callback per tick.
- **`EntityManager`** — `Map<string, Entity>` registry that preserves
  insertion order for determinism. `add / remove / get / has / all /
  toArray / byType / size / clear`.
- **`SystemManager`** — ordered list of `SimulationSystem`s; runs them
  in registration order each tick. `add / remove / get / list /
  update(dt, state) / clear`.
- **`SimulationState`** — the per-tick "context" object passed to every
  system. Aggregates clock + entities + event bus + logger + scenario
  name + a `metrics` object (`ticks`, `totalDistance`, `peakSpeed`,
  `collisionCount`) + a `paths` `PathRegistry` (planned/reference
  paths from scenarios or future communication bridges).
- **`SimulationEngine`** — owns all of the above; exposes `start /
  pause / step / reset / loadScenario / addEntity / removeEntity /
  addSystem / setSpeedFactor / isRunning / getFixedDt`. Internal `tick`
  pipeline:
  1. `clock.tick(dt)`
  2. `systems.update(dt, state)`
  3. `state.metrics.ticks++`
  4. `events.emit('tick', { time, dt, ticks })`
- **`SimulationController`** — thin UI-facing facade: `start / pause /
  reset / step / loadScenarioFromUrl / loadScenarioFromJson /
  isRunning`. Also forwards the recorder API (`setRecordingConfig`,
  `getRecordingConfig`, `getRecordingStatus`, `isRecording`,
  `getRecordingFrameCount`, `startRecording`, `stopRecording`,
  `clearRecording`, `exportRecording`) so UI panels never reach into
  the engine directly.

## Layer 3 — entities (`src/simulation/entities/`)

- **`Entity`** — interface: `id`, `type`, `update(dt, state)`.
- **`BaseEntity`** — abstract; provides id/type and a no-op `update`.
- **`VehicleEntity`** — semi-implicit unicycle:
  ```
  yaw_{t+1} = yaw_t + w · dt
  x_{t+1}   = x_t + v · cos(yaw_{t+1}) · dt
  y_{t+1}   = y_t + v · sin(yaw_{t+1}) · dt
  ```
  Tracks `distanceTraveled`, exposes last applied `v`/`w` for
  telemetry. `radius` is used by collision checks.
- **`StaticObstacleEntity`** — inert obstacle at a fixed `position`.
  Carries a normalized `shape` discriminated union:
  `{ type: 'circle', radius }` or
  `{ type: 'rectangle', length, thickness, yaw }`, where `length` is the
  local forward extent (along local +X after `yaw`), `thickness` is the
  local lateral extent, and `yaw` is in radians (CCW from +X). The
  legacy `{ id, position, radius }` constructor still works and maps to
  a circle. `entity.radius` is always a number — for rectangles it is
  the bounding-circle radius. Inherits the no-op update.
- **`DynamicActorEntity`** — holonomic moving obstacle: world-frame
  velocity + scalar angular velocity, integrated directly. Useful for
  pedestrians or scripted traffic that doesn't follow a kinematic
  constraint.

## Layer 4 — systems (`src/simulation/systems/`)

- **`SimulationSystem`** — interface: `name`, `update(dt, state)`,
  optional `reset()` and `dispose()`. The engine's `reset()` and
  `SystemManager.dispose()` forward those lifecycle hooks; stateless
  systems leave them off.
- **`ScenarioSystem`** — fires time-scheduled scenario events when
  `state.clock.time()` crosses the event's `time`. Runs first so
  scenario-driven entity spawns / commands land before the rest of
  the pipeline observes them.
- **`VehicleCommandSystem`** — drains `VehicleCommandQueue` and
  applies each addressed command to its target vehicle via
  `vehicle.setCommand`. Lives in `src/simulation/commands/` (Layer
  4c) but is registered here in the system order. **Must run before
  `VehicleDynamicsSystem`** so the integrator picks up the new
  controls in the same tick.
- **`VehicleDynamicsSystem`** — iterates vehicles + dynamic actors,
  calls their `update`, accumulates `peakSpeed` and `totalDistance`
  metrics.
- **`CollisionSystem`** — orchestrator only. Builds 2D shapes from
  state via `buildCollisionShapes2DFromState`, asks a pluggable
  `CollisionBackend2D` for current contacts, diffs against the
  previous tick to detect leading-edge pairs, and emits a `collision`
  event (and bumps `collisionCount`) once per new pair. The detection
  algorithm itself lives in the backend — see Layer 4b.
- **`MetricsSystem`** — placeholder for cross-cutting derived metrics.

Default tick order registered by `SimulationProvider`:

```
ScenarioSystem
  ▶ VehicleCommandSystem      ← drains queued commands
    VehicleDynamicsSystem     ← integrates pose with the new controls
    TrajectoryTrackingSystem  ← samples trajectories into state.trajectories
    CollisionSystem           ← detects contacts on the integrated state
    MetricsSystem             ← observes the final state
    SimulationRecorderSystem  ← snapshots final post-tick state when recording
    [CommunicationSystem]     ← optional, when wired
```

`CollisionSystem` is constructed with `SimpleCircleCollisionBackend2D`
by default. New systems can be added via `engine.addSystem(...)`.

## Layer 4c — commands (`src/simulation/commands/`)

The command layer is the only sanctioned write path from the
React / DOM / network layers into vehicle behavior. Producers that
mutate `vehicle.controls` or `vehicle.pose` directly bypass the tick
boundary and break determinism / replay.

- **`VehicleCommand`** — addressed, JSON-friendly command:
  `vehicleId`, optional `linearVelocity` (m/s) and `angularVelocity`
  (rad/s), forward-compatible `throttle` / `brake` / `steering`,
  plus diagnostic `source` (`keyboard | external | scenario |
  planner | unknown`) and `timestampSec`. Distinct from
  `AppliedVehicleCommand` in `entities/VehicleEntity.ts`, which is
  the entity-local form (no `vehicleId`).
- **`VehicleCommandQueue`** — dumb FIFO. `push`, `drain`, `clear`,
  `size`. Does not validate, coalesce, or prioritize. Knows nothing
  about `VehicleEntity`, keyboard, or transports.
- **`VehicleCommandSystem`** — registered in the tick pipeline (see
  above). Drains the queue, looks up each `vehicleId`, and calls
  `vehicle.setCommand(...)`. Commands targeting missing or
  non-vehicle entities are silently dropped (the queue is always
  fully drained so producers can't accumulate stale commands).
  `reset()` clears the queue so a fresh `scenarioLoaded` /
  `engine.reset()` doesn't carry old keystrokes into the next run.

The same queue is consumed by every input source — keyboard hooks,
WebSocket / ROS2 bridges, scenario events, Python planners, joystick
adapters, UI buttons. They all push the same `VehicleCommand` shape.

Forbidden imports inside `simulation/commands/`: React, DOM, Three.js,
WebSocket, ROS2, transports, anything from `ui/` or `infrastructure/`.

## Layer 4b — collision (`src/simulation/collision/`)

The collision algorithm is decoupled from the system that orchestrates
it so backends can be swapped without touching `CollisionSystem`,
entities, or any consumer of the `collision` event.

- **`CollisionShape2D`** — discriminated union (`circle` |
  `oriented_box`). All coordinates are simulation X/Y meters; yaw is
  radians. There is no `z` and no `height` — collision is **2D only**
  on the simulation ground plane. The +Z axis exists conceptually as
  "up" but is not used here in this phase.
- **`CollisionContact2D`** — pair of entity ids plus optional `normal`
  (unit, pointing A → B) and `penetrationDepth` (meters). Optional
  fields let backends that don't compute manifolds (intersection-only
  / sensor paths) participate.
- **`CollisionBackend2D`** — `name`, `detect(shapes)`, optional
  `reset` / `dispose`. `detect` must be pure (no input mutation) and
  deterministic so collision counters don't desync from the events
  fired.
- **`collisionPairKey(a, b)`** — order-independent string key
  (`min|max`) used by `CollisionSystem` to deduplicate contacts and
  to track pairs across ticks.
- **`buildCollisionShapes2DFromState(state)`** — pure read from
  `SimulationState`. Vehicles and dynamic actors map to circles;
  static obstacles map to either `circle` or `oriented_box` shapes
  depending on `entity.shape.type`. For rectangles the entity's
  `length` (along local +X) and `thickness` (along local +Y) are
  converted into the `OrientedBoxCollisionShape2D` convention
  (`width` along local +X, `length` along local +Y) at the boundary;
  `yaw` is forwarded unchanged.
- **`SimpleCircleCollisionBackend2D`** — default backend. O(n²)
  narrow-phase covering three shape combinations: circle-vs-circle,
  circle-vs-oriented-box (clamped-point distance test), and
  oriented-box-vs-oriented-box (2D SAT over four axes). All three
  produce penetration depth and an A→B unit normal; pair ordering is
  deterministic. The legacy class name is kept so existing
  `CollisionConfig.backend = 'simpleCircle2D'` keeps working.
- **`NoopCollisionBackend2D`** — explicit "collisions off" backend.
  `detect()` always returns `[]`. Used when
  `CollisionConfig.backend === 'disabled'` so `CollisionSystem`
  stays in the tick pipeline (preserving pipeline shape and event
  semantics) without doing any work. Useful for tests, benchmarks,
  and free-driving demos.
- **`CollisionConfig`** — `CollisionBackendType =
  'disabled' | 'simpleCircle2D' | 'rapier2D'`. Pure type/config —
  must NOT import Rapier or any concrete backend. The composition
  root (`SimulationProvider`) is the only place allowed to map this
  enum to a class.

Forbidden imports inside `simulation/collision/`:

- `@dimforge/rapier2d-compat` (or any Rapier package).
- Anything from `infrastructure/`.
- Anything from `ui/`, `app/`, or `three`.

A heavy backend (Rapier, Matter.js, Box2D, …) goes under
`src/infrastructure/collision/<vendor>/` and depends only on the
`CollisionBackend2D` contract above. See Layer 10.

## Layer 5 — scenarios (`src/simulation/scenarios/`)

- **`Scenario.ts`** — pure JSON-friendly type definitions:
  `PoseSpec`, `VehicleSpec`, `StaticObstacleSpec` (a discriminated union
  of circle and rectangle specs; see below), `RectangleObstacleSpec`
  (union of `mode: 'center'` and `mode: 'segment'`), `DynamicActorSpec`,
  `EntitySpec` (discriminated by `kind`), `PathPointSpec`, `PathSpec`,
  `KeyboardControlScenarioConfig` / `ScenarioInteractionConfig` (UI
  defaults applied at scenario load — see Layer 8), and `ScenarioSpec`.
  **Static obstacle JSON shapes** (backward compatible):
  - Legacy circle (no `shape` field required): `{ kind, id, position,
    radius }`.
  - Explicit circle: `{ kind, id, shape: 'circle', position, radius }`.
  - Rectangle (center mode): `{ kind, id, shape: 'rectangle',
    rectangle: { mode: 'center', center, length, thickness, yaw } }` —
    `length` = local forward extent (m), `thickness` = local lateral
    extent (m), `yaw` = radians CCW from +X.
  - Rectangle (segment mode): `{ kind, id, shape: 'rectangle',
    rectangle: { mode: 'segment', start, end, thickness } }`. The
    loader derives `center = midpoint(start, end)`,
    `length = distance(start, end)`,
    `yaw = atan2(end.y - start.y, end.x - start.x)`. Identical
    endpoints and non-positive `thickness` are rejected at parse time.
- **`ScenarioLoader`** — `parse(input)` validates raw JSON and throws
  a `ScenarioParseError` on failure; `loadFromUrl(url)` fetches +
  parses; `buildEntity(spec)` instantiates the concrete entity class.
  Validates `interaction.keyboardControl` fields if present (booleans,
  strings, finite non-negative numbers). The engine's
  `loadScenario(spec)` resets the world, materializes entities, loads
  scenario paths into `state.paths`, and emits `scenarioLoaded`. The
  engine **does not** read `spec.interaction` — that's a UI-shell
  concern threaded directly from `ControlPanel` → App via an
  `onScenarioLoaded` callback.
- **`public/scenarios/simple-scenario.json`** — sample with one
  vehicle (v=0.5 m/s, w=0.2 rad/s), three static obstacles, and a
  dynamic actor crossing.

## Layer 5b — paths (`src/simulation/paths/`)

Planned and reference paths are **simulation data**, not renderer data.

- **`PathPoint2D`** — JSON-friendly point `{ x, y, yaw?, targetVelocity?, timeSec? }` in SI units (meters, radians). No Three.js or DOM types.
- **`Path2D`** — collection type `{ id, name?, frameId?, vehicleId?, points, metadata? }`. JSON round-trip safe.
- **`PathRegistry`** — `Map<string, Path2D>` wrapper owned by `SimulationState`. API: `add / remove / get / has / toArray / clear / size`.

**Sources of paths** (in priority order):
1. Scenario file — declared in `ScenarioSpec.paths`; loaded by `SimulationEngine.loadScenario`.
2. Future: communication bridge — `SimPathMessage` → `PathBridge` → `state.paths.add(path)`.

**Renderer rules:**
- Renderers read `state.paths.toArray()` (read-only).
- Renderers must not mutate `state.paths` or any `Path2D`.
- `ThreePathRenderer.sync(state)` visualises paths as `THREE.Line` objects and removes stale lines when paths disappear.

**Path vs trajectory distinction:**

| | Path | Trajectory (actual motion history) |
|---|---|---|
| What | Planned or reference route | Historical pose samples for supported entities |
| Owner | `SimulationState.paths` | `SimulationState.trajectories` (`TrajectoryRegistry`) |
| Source | Scenario, planner, bridge | `TrajectoryTrackingSystem` samples each tick from entity poses (`state.clock.time()`) |
| Sampling | N/A | Configured via scenario `trajectoryTracking` or Inspector → `TrajectoryTrackingSystem.setConfig` |
| Reset | Cleared by `SimulationEngine.reset()` | Cleared by `SimulationEngine.reset()` / `loadScenario`; UI uses `controller.clearTrajectories()` |
| Visualization | `ThreePathRenderer` reads paths | `ThreeTrajectoryRenderer` reads trajectories (GPU lines only; no sampling in renderer) |

## Layer 5c — trajectories (`src/simulation/trajectories/`)

Runtime **actual** trajectories (distinct from planned `Path2D`) are simulation-owned:

- **`TrajectorySample2D`**, **`EntityTrajectory2D`**, **`TrajectoryRegistry`** — JSON-friendly samples keyed by `entityId`.
- **`TrajectoryTrackingSystem`** — after dynamics, appends samples according to `TrajectoryTrackingConfig` (scenario + Inspector).
- Renderers **read** `state.trajectories.toArray()` and draw; they **never** append samples or mutate the registry.

## Layer 5d — recording (`src/simulation/recording/` + `src/ui/replay/`)

Replay support is a strict, simulation-owned data layer. Phase 1
delivered the in-memory recorder; Phase 2 added the Inspector UI and
file download. Phase 3 (replay loading + playback) layers on top of
these contracts without changing them.

- **`SimulationFrameSnapshot`** — JSON-friendly per-tick snapshot.
  Includes `tick` (1-based, matches the `tick` event), `timeSec`, an
  `entities` array (`vehicle` / `static_obstacle` / `dynamic_actor` /
  generic fallback), optional `events` and `metrics`. Static obstacle
  entries optionally carry a `shape: 'circle' | 'rectangle'`
  discriminator and, for rectangles, a `rectangle: { length, thickness,
  yaw }` sub-object; legacy circle frames that pre-date rectangles
  continue to load as circles because `shape` is optional and defaults
  to `'circle'`.
- **`ReplayFileFormat`** — versioned envelope (`format: 'angy_sim_replay'`,
  `version: 1`). Carries `scenarioName`, `fixedDtSec`, optional
  `metadata`, and `frames: SimulationFrameSnapshot[]`. Always
  `JSON.stringify`-safe.
- **`createSnapshotFromState(state)`** — read-only conversion from the
  live `SimulationState` into a `SimulationFrameSnapshot`. Uses only
  public entity APIs; never mutates `state`.
- **`SimulationRecorder`** — pure in-memory frame buffer. Configurable
  with `enabled`, `maxFrames`, `sampleEveryNTicks`. `start / stop /
  clear / append / toReplayFile` only — no DOM, FS, timers, or
  networking. Auto-stops at `maxFrames` and exposes that via
  `getStatus().maxFramesReached`.
- **`SimulationRecorderSystem`** — `SimulationSystem` registered LAST in
  the pipeline so it observes the final post-tick state. Honors the
  recorder's `sampleEveryNTicks` cadence. On auto-stop emits
  `recordingMaxFramesReached` and `recordingStopped` through the event
  bus.
- **Engine API** — `engine.recorder`, `setRecordingConfig`,
  `getRecordingConfig`, `getRecordingStatus`, `isRecording`,
  `getRecordingFrameCount`, `startRecording`, `stopRecording`,
  `clearRecording`, `exportRecording`. `engine.reset()` stops + clears
  the recorder; if previously recording it emits
  `recordingStopped({ reason: 'reset' })` before the canonical `reset`
  event.
- **Events** (added to `SimulationEvents`):
  `recordingStarted({ config })`,
  `recordingStopped({ frameCount, reason: 'manual' | 'maxFramesReached' | 'reset' })`,
  `recordingCleared`,
  `recordingMaxFramesReached({ frameCount })`.

### UI layer (Phase 2, `src/ui/replay/` + `src/ui/RecordingPanel.tsx`)

- **`src/ui/replay/ReplayFileDownloader.ts`** — DOM-aware helpers:
  `buildReplayFileName(replay, options?)` (pure, deterministic via
  `options.now`), `serializeReplay(replay)` (pretty-printed JSON), and
  `downloadReplay(replay, options?)` which composes a `Blob`, an
  off-screen `<a download>`, dispatches a click, then revokes the
  object URL. The only simulation-side dependency is the
  `ReplayFileFormat` *type*.
- **`src/ui/RecordingPanel.tsx`** — Inspector "Recording" panel.
  **Dumb / controlled component**: all state lives in `App.tsx`; the
  panel never imports `SimulationController`, `SimulationRecorder`,
  or any DOM/file API. Exposes a `disabledReason` prop so Phase 3 can
  disable recording while a replay is loaded.
- **App-level wiring (`src/app/App.tsx`)** —
  `controller.{getRecordingStatus,getRecordingConfig}` snapshots are
  refreshed on every recorder lifecycle event
  (`recordingStarted/Stopped/Cleared/MaxFramesReached`), on
  `scenarioLoaded`, and on `reset`. While recording, a lightweight
  `tick` subscription advances the live frame counter. The
  **Download** button calls `controller.exportRecording()` and hands
  the result to `downloadReplay`.

### Replay playback (Phase 3, `src/simulation/recording/` + `src/ui/replay/`)

Playback is *replay of recorded frames*, not resimulation. Live
simulation systems are paused; the renderer paints a read-only
`SimulationState`-shaped view backed by a single recorded frame.
This phase adds the following pieces without changing any Phase 1/2
contract:

- **`ReplaySession`** (sim-side, `src/simulation/recording/ReplaySession.ts`)
  — pure-logic playback cursor over a `ReplayFileFormat`. Public API:
  `getFrameCount`, `getDurationSec`, `getFixedDtSec`,
  `getCurrentIndex`, `getCurrentFrame`, `getFrame(index)`,
  `seekToFrame`, `seekToTime`, `stepForward`, `stepBackward`,
  `reset`, `onChange(listener)`. Emits `onChange` only when the
  cursor actually moves (clamped no-ops stay silent).
- **`createReplayStateFromFrame(frame, fixedDtSec)`** (sim-side,
  `src/simulation/recording/createReplayStateFromFrame.ts`) —
  read-only adapter producing a `SimulationState` whose public
  surfaces (`clock.time()`, `clock.dt()`, `entities.byType(...)`,
  `entities.all()`, `entities.toArray()`, `paths`, `trajectories`)
  match what live renderers already consume. Vehicles, static
  obstacles, and dynamic actors are reconstructed as real class
  instances; generic entities are skipped (no spatial payload).
  Phase-3 limitation: `state.trajectories` is intentionally empty
  (the replay file does not yet store historical samples).
- **`ReplayFileLoader`** (`src/ui/replay/ReplayFileLoader.ts`) —
  pure JSON parser/validator (`parseReplayJson`) plus a thin DOM
  wrapper (`readReplayFromFile(file)`) that decodes a `File` via
  `file.text()`. Returns a discriminated `LoadReplayResult`
  (`{ ok: true, replay }` / `{ ok: false, error }`) so callers
  never have to write `try/catch`. Validates `format`, `version`,
  `fixedDtSec`, and per-frame `tick` / `timeSec` / `entities`.
- **`ReplayPlayer`** (`src/ui/replay/ReplayPlayer.ts`) — UI-side
  timer driver. Wraps a `ReplaySession`, walks `stepForward()`
  proportional to wall-clock elapsed × `speed`, auto-pauses on the
  last frame, and accepts an injectable `scheduler` (`rAF` by
  default) and `now` for tests.
- **`ReplayTimeline`** (`src/ui/replay/ReplayTimeline.tsx`) — dumb
  controlled component rendered below the viewport when
  `runMode === 'replay'`. Slider, play/pause, step buttons, time/frame
  display, optional speed selector, and an "Exit replay" button.
- **`ReplayLoadButton`** (`src/ui/replay/ReplayLoadButton.tsx`) —
  hidden `<input type="file" accept=".json,.angy-replay.json" />`
  wired to `readReplayFromFile`. Reports parsed replays via
  `onLoaded(replay)` and validation errors via `onError(message)`.
- **App-level wiring (`src/app/App.tsx`)** — owns
  `runMode: 'live' | 'replay'`, the `ReplaySession` / `ReplayPlayer`
  refs, and React mirrors of `currentIndex`, `currentTimeSec`,
  `frameCount`, `durationSec`, `isPlaying`, `speed`. On
  `handleReplayLoaded` it pauses the engine, defensively stops any
  in-progress recording, builds a fresh session, subscribes to
  `session.onChange`, and flips `runMode` to `replay`. On
  `handleExitReplay` it disposes the player/session and snaps back
  to live mode (the live engine remains paused — the user resumes
  via the existing **Start** control). Loading a new scenario while
  in replay mode auto-exits replay first.
- **Renderer wiring (`src/ui/viewport/SimulationViewportSwitcher.tsx`
  + `ThreeSimulationViewport.tsx` + `PhaserSimulationViewport.tsx`)** —
  both viewports accept an optional `replayState?: SimulationState`
  prop. When set, the viewport's engine event subscriptions still
  exist but render `replayState ?? engine.state`; a separate effect
  keyed on `replayState` repaints whenever the cursor moves. The
  renderer code itself is unchanged — no replay-specific branches
  ever reach the renderer interface.

Boundaries (enforced by `architecture.recording.test.ts` and
`architecture.replay.test.ts`):

- No React, Three, Phaser, Node `fs`/`path`, or `src/ui/` / `src/app/`
  imports inside `src/simulation/recording/`. This now also covers
  `ReplaySession.ts` and `createReplayStateFromFrame.ts`.
- `src/ui/replay/**` may use DOM APIs but MUST NOT import
  `SimulationRecorder` or `SimulationRecorderSystem`. Imports from
  `src/simulation/recording/` are limited to the public surface:
  `ReplayFormat`, `SimulationFrameSnapshot`, `ReplaySession`, and
  `createReplayStateFromFrame`.
- `src/simulation/recording/**` MUST NOT import `src/ui/replay/**`.
- Sibling UI panels (`src/ui/*.tsx`) MUST NOT import
  `ReplayFileDownloader` — only the App shell wires the side effect.
- Renderers (`src/ui/renderers/**`) MUST remain mode-agnostic. They
  receive a `SimulationState` and have no idea whether it came from
  the live engine or the replay adapter.

## Layer 6 — render / events / logging

- **`SimulationRenderer`** — interface only (`init(state)`,
  `render(state)`, `dispose()`). No implementation lives in core.
  Renderers are read-only consumers of `SimulationState` and must
  not mutate it.
- **`EventBus` / `TypedEventBus<EventMap>`** — generic typed pub/sub:
  `on(event, handler)` returns an unsubscribe function, `off`, `emit`.
  Handlers are stored in a `Map<keyof EventMap, Set<Handler>>`.
- **`SimulationEvents`** — the engine's event map:
  `tick`, `started`, `paused`, `reset`, `scenarioLoaded`,
  `collision`, `entityAdded`, `entityRemoved`,
  `recordingStarted`, `recordingStopped`, `recordingCleared`,
  `recordingMaxFramesReached`, `profileSample`.
- **`Logger`** — level-filtered (`debug`/`info`/`warn`/`error`) with a
  pluggable `LoggerSink`. Defaults to a `ConsoleLoggerSink`.

### Engine profiler (`src/simulation/profiling/`)

`SimulationEngine` owns a `SimulationProfiler` that measures **wall-clock**
duration of each tick's `SystemManager.update` call, broken down by
system. It is a diagnostic layer with no effect on deterministic
behavior:

- Types (`ProfilerTypes.ts`): `SystemTimingSample`, `TickTimingSample`,
  `ProfilerAggregate`, `ProfilerSnapshot`.
- Data (`RollingProfilerBuffer.ts`): bounded ring buffer; default
  capacity 120 (~2 s at 60 Hz). FIFO eviction.
- Coordinator (`SimulationProfiler.ts`): takes an injectable
  `nowMs: () => number` (default `performance.now()` with a
  `Date.now()` fallback) and exposes a structural
  `SystemTickInstrument` that `SystemManager.update` accepts as an
  optional third argument. When the profiler is disabled, the
  manager's iteration path is byte-equivalent to the pre-profiler
  implementation.
- Event: `profileSample` is emitted on the existing
  `TypedEventBus<SimulationEvents>` after `tick`, carrying the
  `TickTimingSample` for the just-finished tick.

**Guarantees**: the profiler never mutates `SimulationState`,
entities, paths, trajectories, or renderer state; it does not change
the fixed-step `dt`; its samples are runtime-only and are NEVER
written to `SimulationFrameSnapshot` / `ReplayFileFormat`.

**UI**: `src/app/useSimulationProfiler.ts` (React hook) subscribes to
`profileSample` via `useSyncExternalStore`. `src/ui/PerformanceOverlay.tsx`
renders the snapshot as an absolute-positioned top-left overlay above
the `viewport-surface` wrapper; `src/ui/PerformancePanel.tsx` is the
Inspector checkbox that toggles it. The overlay is renderer-agnostic
and never touches `ThreeSimulationRenderer`, `PhaserSimulationRenderer`,
`ThreeSimulationViewport`, or `PhaserSimulationViewport`.

## Layer 7 — React shell (`src/app/`, `src/ui/`)

- **`SimulationContext.ts`** — `createContext` lives in its own module
  so Vite's React Fast Refresh doesn't trip on mixed exports.
- **`SimulationProvider.tsx`** — builds the engine **once**, creates
  the shared `VehicleCommandQueue`, registers the default system
  pipeline (`ScenarioSystem` → `VehicleCommandSystem` →
  `VehicleDynamicsSystem` → `TrajectoryTrackingSystem` →
  `CollisionSystem` → `MetricsSystem` → `SimulationRecorderSystem`,
  with `CommunicationSystem` optional), wraps the engine with
  `SimulationController`, and exposes `engine`, `controller`, and
  `commandQueue` through context. Pauses the engine on unmount.
- **Hooks (`useSimulation.ts`)** — all leaf-level subscriptions via
  `useSyncExternalStore`:
  - `useSimulation()` → `{ controller, engine, commandQueue }`
  - `useSimulationTime()` → updates on every `tick`
  - `useSimulationRunning()` → updates on `started`/`paused`/`reset`
  - `useEntityListVersion()` → updates on entity add/remove + tick
- **UI components (`src/ui/`)** —
  `ControlPanel` (Start / Pause / Step / Reset / Load Scenario / pick
  Renderer), `ConnectionStatusPanel` (transport selector / endpoint /
  status only), `Ros2TopicsPanel` (generic topic discovery UI, shown
  only when the selected transport exposes the capability),
  `EchoCard` (generic topic echo session view), `SimulationTimeDisplay`,
  `MetricsPanel`,
  `EntityListPanel`, `RecordingPanel` (Inspector "Recording" panel —
  start/stop/clear/download with config inputs; dumb component),
  `replay/ReplayLoadButton` + `replay/ReplayTimeline` (Phase 3
  replay-mode controls — slider, play/pause, step, speed, exit), and
  `viewport/SimulationViewportSwitcher` which conditionally mounts
  either `ThreeSimulationViewport` or `PhaserSimulationViewport`
  based on UI-only React state. The viewports accept an optional
  `replayState` prop: when set, they render that state instead of
  `engine.state` while still using the same renderer code path. See
  Layer 9 for the renderer adapters.
- **Layout** — `src/app/App.tsx` + `src/app/app.css`: full-viewport
  flex shell, two-column grid (viewport left, Inspector right), no
  fixed-position overlays.

## Layer 8 — external communication (`src/simulation/communication/` + `src/infrastructure/communication/`)

The simulator can talk to the outside world (UIs, control stacks, ROS2,
DDS, MQTT, …) through a layer that the engine does **not** know how to
reach. The contracts live in `src/simulation/communication/`; the
concrete wires live in `src/infrastructure/communication/`. The engine
imports only the contracts.

### Contracts (engine-side)

- **`Transport`** — opaque pub/sub by topic name only. `connect`,
  `disconnect`, `isConnected`, `publish<T>(topic, message)`,
  `subscribe<T>(topic, handler)` returning an idempotent unsubscribe.
  Knows nothing about ROS2, DDS, WebSocket, entities, or rendering.
- **`MessageAdapter<TExternal, TInternal>`** — bidirectional translator
  (`toInternal`, `fromInternal`) between a wire-format payload and an
  internal simulator message. ROS2-specific adapters belong in
  infrastructure / a future integration package — never here.
- **`TopicBridge`** — `start()` / `stop()` lifecycle for a unit of
  comms behavior (one bridge ≈ one topic ↔ one engine concern).
  Bridges may read engine state and produce outbound messages.
  **Inbound bridges must not mutate entities directly**: they push a
  `VehicleCommand` onto `VehicleCommandQueue` (Layer 4c) and let
  `VehicleCommandSystem` apply it during the tick.
- **Internal messages** (`messages/`) — JSON-friendly POJOs:
  `SimClockMessage`, `SimPose2DMessage`, `SimVehicleStateMessage`.
  They are deliberately NOT ROS2 messages; ROS2 maps to them through
  adapters. Inbound vehicle commands use the canonical
  `VehicleCommand` (`src/simulation/commands/VehicleCommand.ts`)
  directly — there is no separate "wire" command type, so every
  producer (keyboard, transport, scenario, planner) speaks the same
  shape.
- **`TopicRegistry`** — central catalog of well-known logical topics
  (`/control/ego/command`, `/sim/ego/state`, `/sim/clock`,
  `/sim/collision`) with optional `frequencyHz` hints. Naming is
  simulator-flavored; mapping to a broker's namespace is the adapter's
  job.
- **`PeriodicPublisher`** — accumulates simulation `dt` and fires a
  callback once the configured `periodSec` is reached. Uses no
  `setInterval`, no `requestAnimationFrame`, no wall-clock — so the
  publish rate scales naturally with sim time (paused → no publishes;
  fast-forwarded → faster publishes). On unusually large `dt`, missed
  periods are dropped (telemetry is a sample, not a queue).
- **`CommunicationSystem`** — a `SimulationSystem` whose only job is to
  drive a list of `PeriodicPublisher`s with the engine's `dt`. Adding
  it to the system manager is what makes outbound telemetry "tick"
  with the simulation. `reset()` is a manual API; call it on engine
  reset to clear accumulators.
- **Bridges** —
  - `VehicleCommandTopicBridge` subscribes to a command topic,
    validates / adapts the payload into a `VehicleCommand`, and
    pushes it into `VehicleCommandQueue`. **It never calls
    `vehicle.setCommand(...)` directly.** Routing by `vehicleId`
    happens later in `VehicleCommandSystem`, which has the only
    authoritative view of `state.entities`. Constructor takes only
    `Transport` / topic / `VehicleCommandQueue` / `MessageAdapter`
    (and an optional `Logger`). The bridge has **no dependency on
    `SimulationEngine`, `SimulationState`, `EntityManager`, or any
    entity type** — it cannot read engine state and cannot mutate it.
    A grep for `SimulationEngine` / `SimulationState` /
    `VehicleEntity` in the bridge file should always return zero
    matches; if it doesn't, the boundary has been violated.
  - `VehicleStatePublisherBridge` builds a `SimVehicleStateMessage`
    from the engine state and ships it on demand (driven by
    `PeriodicPublisher`).
  - `ClockPublisherBridge` does the same for `SimClockMessage`.
- **Adapters** — `JsonVehicleCommandAdapter`,
  `JsonVehicleStateAdapter`, `JsonClockAdapter` are pass-through with
  strict validation (no `NaN`, no missing required fields). They are
  the canonical "I want JSON over the wire" choice.

### Concrete transports (`src/infrastructure/communication/`)

- **`MockTransport`** — synchronous in-process transport for tests;
  records every published message, keeps subscriptions across
  `disconnect`/`reconnect`.
- **`InMemoryTransport`** — same wire model as Mock, but dispatches
  via `queueMicrotask` so publishers can't re-enter their own
  subscribers in a single sync frame; `disconnect()` clears handlers.
- **`WebSocketTransport`** — bare-bones `WebSocket` transport using a
  `{ topic, payload }` envelope (`WebSocketEnvelope`). Resolves
  `connect()` on `open`, rejects `publish()` when not open (so caller
  sees backpressure issues immediately), parses incoming JSON frames
  and routes them by topic. **This file is the only place in the repo
  allowed to import the WebSocket API.** It must not be imported from
  `src/simulation`.
- **`RoslibRosbridgeTransport`** — concrete ROS 2 transport under
  `src/infrastructure/communication/rosbridge/`. It adapts `roslibjs`
  / `rosbridge_server` to the generic `Transport` interface and is
  selected only at the app composition root when
  `TransportKind === 'rosbridge'`. It may call rosbridge services
  (for example rosapi) and register runtime topic types for
  subscriptions, but those details stay in the rosbridge infrastructure
  folder.
- **Rosbridge adapters** —
  `RosTwistToVehicleCommandAdapter` converts
  `geometry_msgs/msg/Twist` into `VehicleCommand`, and
  `SimClockToRosClockAdapter` converts `SimClockMessage` into
  `rosgraph_msgs/msg/Clock`. ROS message shapes do not cross into
  `src/simulation`.

### App-facing communication capabilities (`src/app/`)

Some transport features are UI conveniences rather than engine
contracts. They are exposed as optional capabilities from
`CommunicationContext`, so panels can stay generic and transports can
still be replaced.

- **Transport status/config** — `CommunicationProvider` owns the
  selected `TransportKind`, endpoint config, connection status
  (`disabled | disconnected | connecting | connected | error`), and
  concrete transport instantiation. `ConnectionStatusPanel` only
  consumes this generic state and remains focused on transport
  selection, endpoint URL, status, and short transport help text.
- **`TopicDiscovery`** — `src/app/TopicDiscovery.ts` defines
  `TopicInfo`, `TopicDiscoveryState`, and system-topic filtering. The
  UI sees `topics`, `status`, `error`, `lastUpdated`, and `refresh()`;
  it does not know whether topics came from rosapi, DDS discovery, a
  backend gateway, or a mock.
- **`TopicEcho`** — `src/app/TopicEcho.ts` defines
  `TopicEchoSession` and `TopicEchoCapability`
  (`sessions`, `startEcho`, `stopEcho`, `closeEcho`). `EchoCard`
  renders sessions from this generic shape and never imports
  transport-specific code.
- **`RenderableTopics`** — `src/app/RenderableTopics.ts` defines
  `RenderableTopicKind`, `RenderableTopicSupport`,
  `RenderableTopicSelection`, and `RenderableTopicCapability`
  (`isRenderable`, `getUnsupportedReason`, `isSelected`, `selectTopic`,
  `deselectTopic`, `selectedTopics`). The whitelist of renderable
  `(topicName, messageType, kind)` tuples lives here as plain data —
  starting with `/circle_path` (`nav_msgs/msg/Path`, kind `path2d`).
  `Ros2TopicsPanel` consumes this capability through the
  `useRenderableTopics()` hook and renders a per-row checkbox; the
  panel never knows whether the data flows through rosbridge / DDS /
  MQTT.
- **Rosbridge implementations** — `RosbridgeTopicDiscovery` calls
  `rosapi_msgs/srv/Topics` through the rosbridge transport's injected
  service caller. `RosbridgeTopicEcho` uses the generic subscription
  path plus rosbridge-local topic type registration.
  `RosbridgeRenderableTopics` owns one rosbridge subscription per
  selected renderable topic, runs each frame through a
  message-type-specific adapter (today: `RosPathToPath2DAdapter` for
  `nav_msgs/msg/Path` → `Path2D`), and pushes the result into a
  simulation-side `ExternalPathUpdateQueue` rather than touching
  `SimulationState` directly. All three live under
  `src/infrastructure/communication/rosbridge/`.
- **External-data tick handoff** — `ExternalPathUpdateQueue`
  (`src/simulation/paths/`) is a coalescing mailbox of pending
  `Path2D` upserts/removes. `ExternalPathRenderSystem`
  (`src/simulation/systems/`) drains the queue once per tick and
  applies it to `state.paths`, which is the single point where
  externally-sourced paths land in simulation state. This preserves
  the rule that external (rosbridge / WebSocket / DDS) callbacks
  never mutate `SimulationState` directly.
- **UI workflow** — `Ros2TopicsPanel` is rendered only when the active
  transport is `rosbridge` and the connection is `connected`. It
  auto-loads discovered topics, hides common ROS system topics by
  default, keeps the topic list collapsed by default, and enables
  `Echo` only when the panel is maximized. Echo sessions render as
  separate closeable `EchoCard`s. Each row also carries a render
  checkbox at the start: enabled when the topic is in the renderable
  whitelist, disabled (with tooltip) otherwise.

### Why this is transport-agnostic

The simulator only ever depends on **interfaces**, never on a
particular wire. Concretely:

- Swapping WebSocket for ROS2 is implementing/selecting one concrete
  `Transport` and zero changes to bridges / engine.
- ROS2 message types (`nav_msgs/Odometry`, `geometry_msgs/Twist`,
  `rosgraph_msgs/Clock`) never appear in `src/simulation`; ROS-specific
  adapters live under `src/infrastructure/communication/rosbridge/` (or
  another future transport folder) and convert to/from simulator-owned
  messages.
- The engine's `dt` is the only timing primitive `PeriodicPublisher`
  uses — replay, headless tests, and fast-forward all "just work".
- Topic discovery and echo are optional app/provider capabilities, not
  engine requirements. A future `DdsTransport`, `MqttTransport`, or
  backend gateway can expose the same capability shape without changing
  `Ros2TopicsPanel` or `EchoCard`.

### ROS2 integration paths

1. **Current path — rosbridge.** `RoslibRosbridgeTransport` uses
   `roslibjs` to connect to `rosbridge_server` (default endpoint:
   `ws://localhost:9090`). Inbound `/cmd_vel` uses
   `RosTwistToVehicleCommandAdapter`; outbound `/clock` uses
   `SimClockToRosClockAdapter`; topic discovery / echo use generic
   app capabilities backed by rosbridge-local implementations. No
   engine changes are required.
2. **Backend WebSocket bridge to `rclpy` / `rclcpp`.** A small Node /
   Python service exposes a WebSocket using the `WebSocketEnvelope`
   shape and translates frames into ROS2 publishes/subscribes.
   Browser side stays on `WebSocketTransport`.
3. **Native DDS bridge.** Write a `DdsTransport` that talks to a DDS
   participant (e.g. via `cyclonedds-js`, FastDDS WS bridge, or a
   companion service). Adapters under
   `src/infrastructure/communication/dds/` translate between sim
   messages and DDS topic types.
4. **MQTT.** Same pattern: `MqttTransport` plus topic+payload adapters.

In every case the engine, bridges, internal messages, and existing
JSON adapters stay untouched.

### Integration example

```ts
const transport = new WebSocketTransport('ws://localhost:8080')
await transport.connect()

const commandBridge = new VehicleCommandTopicBridge(
  transport,
  Topics.egoCommand.name,
  commandQueue,                    // shared queue from <SimulationProvider>
  new JsonVehicleCommandAdapter(),
  engine.logger,                   // optional
)
await commandBridge.start()

const stateBridge = new VehicleStatePublisherBridge(
  transport,
  'ego',
  Topics.egoState.name,
  engine,
  new JsonVehicleStateAdapter(),
)
await stateBridge.start()

const clockBridge = new ClockPublisherBridge(
  transport,
  Topics.clock.name,
  engine,
  new JsonClockAdapter(),
)
await clockBridge.start()

engine.addSystem(
  new CommunicationSystem([
    new PeriodicPublisher(1 / 20, () => stateBridge.publishOnce()),
    new PeriodicPublisher(1 / 50, () => clockBridge.publishOnce()),
  ]),
)
```

Notes:

- `CommunicationSystem` runs **after** the dynamics / collision /
  metrics systems if you register it last, which is the recommended
  order — outbound telemetry then reflects the just-applied tick.
- For tests and local development, swap `WebSocketTransport` for
  `MockTransport` or `InMemoryTransport` without touching the rest.

## Layer 9 — rendering adapters (`src/ui/renderers/`, `src/ui/viewport/`)

Renderers are **pure consumers** of `SimulationState`. They live
entirely outside the simulation core: nothing under `src/simulation/`
or `src/math/` imports a rendering library, DOM API, or React. The
core only knows the `SimulationRenderer` interface; concrete renderers
plug in through the React shell.

Two renderers ship today, both as siblings under `src/ui/renderers/`:

- **Three.js** (`src/ui/renderers/three/`) — the default 3D adapter,
  with full debug overlays and three camera modes (orbit, follow,
  top-down).
- **Phaser** (`src/ui/renderers/phaser/`) — a 2D canvas adapter for
  cases where a flat top-down view is the natural fit.

The active renderer is React UI state owned by the App
(`RendererType = "three" | "phaser"`). `SimulationViewportSwitcher`
unmounts the previous viewport (which disposes its renderer cleanly)
and mounts the next one; the engine is owned by `SimulationProvider`
higher up the tree, so a renderer switch does **not** reset the
simulation. Both adapters subscribe to the same engine events
(`tick`, `reset`, `scenarioLoaded`, `entityAdded`, `entityRemoved`,
`collision`).

Future renderers (Pixi, Canvas 2D, WebGPU) follow the same shape and
live as siblings under `src/ui/renderers/`.

### Three.js renderer — modules

- **`viewport/ThreeSimulationViewport.tsx`** — the React mount. Owns
  the container `<div>`, instantiates `ThreeSimulationRenderer`, calls
  `init(state)` once, forwards engine events (`tick`, `reset`,
  `scenarioLoaded`, `entityAdded`, `entityRemoved`, `collision`) and
  `window.resize` / `ResizeObserver` to the renderer, and disposes on
  unmount. Does not import Three.js directly — it only imports the
  renderer adapter class — and contains zero simulation logic. Accepts
  a `trajectoryVisualization` prop (visual style only) and pushes
  changes through a separate `useEffect`. Exposes
  `clearTrajectoryRenderCache()` (GPU line cache only; use
  `controller.clearTrajectories()` to clear simulation data).
- **`renderers/three/core/ThreeSimulationRenderer.ts`** — top-level
  Three.js coordinator. Implements `SimulationRenderer`. Creates the
  `THREE.Scene`, camera, `WebGLRenderer`, lights, and every
  sub-renderer; orchestrates them in `init` / `render` / `dispose`.
  Exposes `resize()`, `clearTrajectoryRenderCache()` (GPU only),
  `setTrajectoryVisualizationConfig(...)`, `setCameraMode(mode)`,
  `setProjection(...)`, and legacy aliases `clearTrails` / `setTrailConfig`
  for compatibility. Each setter triggers a repaint (using the
  last rendered state) so config edits are visible while paused.
- **`renderers/three/core/ThreeSceneContext.ts`** — small
  pass-by-reference struct (`scene`, `camera`, `renderer`,
  `container`, `requestRender`) that every sub-renderer needs.
  Treated as immutable by sub-renderers; the camera mode manager is
  the only actor allowed to swap the camera's pose. The
  `requestRender` callback is bound by the renderer to its own
  `render(lastState)` so interactive components (OrbitControls
  drag / zoom) can repaint between engine ticks.
- **`renderers/three/core/ThreeRenderObjectRegistry.ts`** — typed
  `Map<string, T extends THREE.Object3D>`. Each per-entity sub-renderer
  owns one; lifecycle (create lazy, sync, evict stale, dispose) lives
  on the sub-renderer.
- **`renderers/three/core/threeDisposal.ts`** — depth-first disposal
  walker. Disposes geometries, materials (single + array), and the
  common texture map slots (`map`, `normalMap`, `roughnessMap`,
  `metalnessMap`, `aoMap`, `emissiveMap`, `alphaMap`). Forgetting GPU
  cleanup leaks one buffer per add/remove cycle in long sessions —
  this helper is the only place renderers touch `dispose()`.

### Coordinate convention & mapping

Engine: right-handed, **+X right / +Y forward / +Z up**, radians, SI.
Three.js: right-handed, **+X right / +Y up / +Z toward camera**.

The mapping is kept in **one** place — `mapping/simToThree.ts`
(forward) and `mapping/threeToSim.ts` (reverse) — and documented as
constants in `mapping/coordinateConventions.ts` for tooling /
discoverability.

```
sim.x →  three.x
sim.y → -three.z          (sign flip — preserves handedness)
sim.z →  three.y
yaw   →  rotation.y = +yaw     (vehicle mesh local forward = +X)
```

**Why the sign flip on Y.** Without it (`sim.y → +three.z`) the embedded
sim frame is **left-handed** in three space — `simX × simY` evaluates
to `−simZ`. A Three.js camera local frame is always right-handed, so a
left-handed embedding makes Gazebo-style top-down (`+X right, +Y up,
X×Y = +Z toward viewer`) **mathematically impossible**: the `lookAt`
cross-product math forces one axis to flip on screen no matter how
`up` is configured. With the sign flip, embedding handedness matches
three's and Gazebo conventions become natural.

**Yaw under the right-handed mapping is identity.** A sim yaw of +π/2
takes heading from sim+X to sim+Y, i.e. from three+X to three−Z.
Rotation about three+Y by θ takes +X to (cos θ, 0, −sin θ); at
θ=+π/2 that's (0, 0, −1) = three−Z ✓. Hence `rotation.y = +yaw`.
The derivation lives at the top of `simToThree.ts`; renderers must
never re-derive it inline.

**Camera presets live in the mapping module too.** Top-down and
Gazebo-like (3/4 perspective) camera position + `up` vectors are
exposed as helpers — `getThreePositionForTopDownCamera`,
`getThreeCameraUpForTopDown`, `getThreePositionForGazeboLikeCamera`,
`getThreeCameraUpForSimulationZUp` — so camera controllers contain no
raw axis literals. Tests in `simToThree.test.ts` verify the
right-handedness of the embedding *and* assert the on-screen
orientation derived from these presets via the same lookAt math
Three.js uses internally.

### Object sub-renderers (`renderers/three/objects/`)

Each sub-renderer is responsible for **one entity type** (or one
piece of static scenery) and has the same lifecycle:
`sync(state)` → upsert objects, drop stale ones; `dispose()` →
remove + GPU-dispose everything. None of them touch entity internals
beyond the public read API.

- **`ThreeGroundRenderer`** — static ground plane (40×40 m) plus a
  1 m grid. Created once, never reads `SimulationState`.
- **`ThreeAxesRenderer`** — three custom arrow primitives at the
  origin, one per simulation axis (red / green / blue = X / Y / Z),
  oriented through `simDirection3DToThree` so the renderer never
  encodes the mapping directly. Adds a small flat green origin
  marker. Uses *custom* arrows rather than `THREE.AxesHelper`
  because the helper draws three's native axes, which under our
  sim→three mapping are *not* the simulation axes.
- **`ThreeVehicleRenderer`** — one `BoxGeometry` per vehicle, mesh
  long axis along sim +X (matching the yaw convention). Repositions
  via `simPoint2DToThree`; rotates via `simYawToThreeRotationY`.
- **`ThreeStaticObstacleRenderer`** — draws `StaticObstacleEntity`
  based on `entity.shape.type`: vertical cylinders for circles, boxes
  (`THREE.BoxGeometry`) oriented via `simYawToThreeRotationY` for
  rectangles. Reads the normalized `length`/`thickness`/`yaw` off the
  entity; no geometry calculation happens in the renderer.
- **`ThreeDynamicActorRenderer`** — spheres for dynamic actors.
- **`ThreeTrajectoryRenderer`** — draws **actual** trajectories from
  `state.trajectories` as `THREE.Line` objects (one per `entityId`).
  Sampling is performed only by `TrajectoryTrackingSystem`; this
  sub-renderer maps sample coordinates with `simPoint2DToThree` and
  applies **visual** settings (`ThreeTrajectoryVisualizationConfig`:
  enabled, height, color, opacity, lineWidth). It never mutates
  `SimulationState` or appends samples.
- **`ThreePathRenderer`** — renders planned/reference paths from
  `state.paths`. One `THREE.Line` per `Path2D.id`; stale lines are
  removed when paths disappear. Uses `simPoint2DToThree` from the
  central mapping module; never mutates `SimulationState` or `Path2D`.

### Debug layer (`renderers/three/debug/`)

- **`ThreeDebugLayer`** — fans out `sync` to per-flag debug
  renderers; `setOptions` toggles them at runtime. Options include
  `showBoundingOutlines` (master toggle for the shape-aware outline)
  and `vehicleBoundingOutlineShape` (`"circle" | "rectangle"`), both
  driven from the Inspector's **Debug overlay** panel so Three.js and
  Phaser viewports stay in sync. Defaults preserve the pre-rectangle
  look (outlines on, vehicle drawn as a circle).
- **`BoundingOutlineRenderer`** (formerly `BoundingCircleRenderer`) —
  shape-aware thin outline. Static obstacles pick their shape from
  `StaticObstacleEntity.shape` (`circle` → 48-segment `LineLoop`,
  `rectangle` → 4-corner `LineLoop` rotated by `yaw`). Dynamic actors
  are always drawn as circles. Vehicles use the
  `vehicleBoundingOutlineShape` option: `circle` matches the old
  behavior (`vehicle.radius`); `rectangle` uses the existing vehicle
  body proportions (`VEHICLE_LENGTH_RATIO` / `VEHICLE_WIDTH_RATIO`
  from `config/VisualStyle.ts`). The per-entity shape decision is
  delegated to the pure helper
  `src/ui/renderers/debug/resolveBoundingOutline.ts` so the Three.js
  and Phaser adapters never diverge. This renderer is read-only;
  nothing about collision or replay depends on the outline.
- **`HeadingArrowRenderer`** — stylized arrow showing each
  vehicle's yaw (shaft + cone, both pre-rotated to local +X).
- **`VelocityVectorRenderer`** — thin segment from the vehicle pose
  along its current forward velocity (length = `v` m). Off by
  default until the UI grows a toggle.
- **`CollisionHighlightRenderer`** — placeholder; will pulse a ring
  on `collision` events once a renderer-side animation clock lands.

### Cameras (`renderers/three/cameras/`)

- **`CameraController`** interface — `attach`, `update`, `detach`,
  optional `dispose`. `attach` parks the camera at the mode default;
  `update` runs on every render to track moving targets; `detach`
  resets shared state (e.g. the camera's `up` vector) before another
  controller takes over.
- **`attachOrbitControls(context, options)`** — single source of
  truth for `OrbitControls` setup across every interactive mode.
  Returns a `{ controls, dispose }` handle. Wires the
  `change → context.requestRender()` bridge so drag / zoom repaint
  the canvas while the engine is paused. Damping is intentionally
  off so each input event maps to exactly one render. Every mode
  difference (rotate vs no-rotate, distance limits, target) is a
  flag passed in here, not duplicated logic.
- **`TopDownCameraController`** — top-down minimap with **drag-pan
  and zoom only** (no rotation). Pulls position and `up` from the
  mapping module (`getThreePositionForTopDownCamera`,
  `getThreeCameraUpForTopDown`) so on-screen orientation matches
  Gazebo: **+X right, +Y up**. Delegates to `attachOrbitControls(...,
  { enableRotate: false, screenSpacePanning: true })`. The
  `screenSpacePanning: true` override is required specifically for
  the top-down view: with the default (`false`), OrbitControls
  derives its pan-up axis as `cross(camera.up, camera.right)`,
  which for a top-down `up` collapses to world Y — vertical drag
  would then move the camera toward / away from the ground and
  feel like a simultaneous zoom. Screen-space panning makes the
  pan-up axis equal to the camera's local up so vertical drag
  scrolls the map "north" without any vertical motion. On detach
  the controller restores `camera.up` to
  `getThreeCameraUpForSimulationZUp()` so the next mode starts
  clean.
- **`OrbitCameraController`** — interactive 3/4 view with a
  **Gazebo-like default placement**: camera sits at sim
  `(+d, -d, +d)` (mapped through `getThreePositionForGazeboLikeCamera`)
  with `up = sim +Z` (`getThreeCameraUpForSimulationZUp`), looking
  back at the origin. Left-drag rotates, wheel zooms, right-drag
  pans. Wraps `attachOrbitControls` with `enableRotate: true`. No
  `@react-three/drei` / fiber dependency — everything goes through
  the stock `three` package.
- **`FollowVehicleCameraController`** — chase-cam behind and above
  the first vehicle in `state.entities`. Reads `vehicle.pose`;
  never mutates it.
- **`CameraControllerManager`** — owns one instance per
  `CameraMode`, handles `attach` / `detach` on `setMode`, and is
  cheap to swap modes (no recreation). Exposes `reattachActive()`
  for the top-level renderer to call after swapping the camera
  object (e.g. on a perspective ↔ orthographic toggle), so the
  active controller rebinds to the new camera.
- **`Projection`** — `'perspective' | 'orthographic'`. Orthogonal
  to `CameraMode`: any combination is allowed. The renderer owns
  the live `Projection` and exposes `setProjection` /
  `getProjection`; switching projections rebuilds the underlying
  `THREE.Camera`, updates `ThreeSceneContext.camera`, then calls
  `cameraControllerManager.reattachActive()` so OrbitControls and
  `up`-vector setup re-bind to the new camera object.

### Camera input (`ui/viewport/ThreeSimulationViewport.tsx`)

- **`c`** cycles through `orbit → followVehicle → topDown → orbit`
  via `renderer.setCameraMode(...)`.
- **`p`** toggles `perspective ↔ orthographic` via
  `renderer.setProjection(...)`.
- Listeners attach to `window` so the keys work regardless of focus,
  but bail out when the event target is an `<input>` / `<textarea>` /
  `<select>` / `contenteditable` to avoid stealing typing.
- A small HUD chip in the viewport header shows the current
  `mode · projection`; this state lives in React and is updated only
  on key press, never per frame.

### Config (`renderers/three/config/`)

- **`ThreeRendererConfig`** with `showGrid`, `showAxes`, `showDebug`,
  `trajectoryVisualization` (`ThreeTrajectoryVisualizationConfig`),
  `cameraMode`, `projection`, `orthoFrustumHeight`. Trajectory
  **sampling** is not here — it lives in `TrajectoryTrackingConfig`
  (simulation). Visualization fields are `enabled`, `height`, `color`,
  `opacity`, `lineWidth` only.

### What renderers must never do

- Mutate `SimulationState`, entity fields, or fire engine events.
- Compute physics, collisions, or scenario logic.
- Schedule the simulation (the engine owns the tick — the viewport
  only invokes `render(state)` in response to engine events and DOM
  resize).
- Duplicate the sim ↔ three coordinate or yaw mapping. Always go
  through `mapping/simToThree.ts`.

### Phaser renderer — modules

The Phaser adapter (`src/ui/renderers/phaser/`) mirrors the Three.js
shape one-for-one so that adding it required no changes to the
simulation core. The renderer is purely 2D — the sim Z axis is
ignored. Phaser-specific notes:

- **`viewport/PhaserSimulationViewport.tsx`** — React mount.
  Equivalent to `ThreeSimulationViewport` (event forwarding, resize,
  imperative `clearTrails()` handle, no simulation logic).
- **`renderers/phaser/core/PhaserSimulationRenderer.ts`** — top-level
  coordinator. Implements `SimulationRenderer`. Owns a `Phaser.Game`
  configured with `Scale.RESIZE`, a single `Phaser.Scene` named
  `simulation`, and a shared `PhaserSceneContext` threaded into
  every sub-renderer. Disables Phaser's banner, audio, and physics
  systems — none are needed for a pure visual adapter.
- **`renderers/phaser/core/PhaserSceneContext.ts`** — pass-by-reference
  struct (`game`, `scene`, `container`, `viewport`). The viewport
  field is mutable because the canvas size — and therefore the
  on-screen origin — changes on resize.
- **`renderers/phaser/core/PhaserRenderObjectRegistry.ts`** —
  generic `Map<string, T extends Phaser.GameObjects.GameObject>`.
  Same lifecycle pattern as the Three.js registry.
- **`renderers/phaser/core/PhaserCameraController.ts`** — mouse pan
  + zoom for the 2D viewport. Drives Phaser's main camera
  (`scrollX/Y`, `zoom`) only — never mutates `SimulationState` or
  any sub-renderer's geometry. Wheel zooms anchored at the cursor
  (the world point under the pointer stays put across the zoom
  step), left-button drag pans (screen-pixel delta is divided by
  `camera.zoom` so the pinned world point stays under the cursor at
  any zoom). On every viewport change the controller fires
  `onViewportChange()` so the metric grid — the one overlay sized
  to the visible world rect — can redraw.
- **`renderers/phaser/mapping/simToPhaser.ts`** — single source of
  truth for sim → screen conversion. Sim +X maps to canvas +X,
  sim +Y maps to canvas −Y (so simulation +Y appears upward), sim
  yaw maps to negated Phaser rotation (Phaser positive rotation is
  CW; we negate so a CCW sim yaw renders as CCW on screen because
  we already flipped the screen Y axis). The module has zero
  `phaser` imports — it speaks in plain `{ x, y }` records and
  primitive numbers, which keeps the unit tests free of Phaser's
  DOM/canvas dependency.
- **`renderers/phaser/mapping/phaserToSim.ts`** — inverse helpers
  for canvas → sim (used by interaction code that picks pixels and
  needs sim meters).
- **`renderers/phaser/objects/`** — sub-renderers per entity kind
  (`PhaserVehicleRenderer`, `PhaserStaticObstacleRenderer`,
  `PhaserDynamicActorRenderer`, `PhaserPathRenderer`,
  `PhaserTrailRenderer`) plus the static scene
  (`PhaserGroundRenderer`, `PhaserAxesRenderer`). Each owns a
  registry and disposes its `Phaser.GameObject`s on `dispose()`.
  `PhaserStaticObstacleRenderer` branches on
  `obstacle.shape.type`: filled arcs for circles, filled rotated
  rectangles for rectangles (rotation via `simYawToPhaserRotation`).
  `PhaserGroundRenderer` sizes its line range to the active
  camera's `worldView` rect — not the canvas — so panning and
  zooming always keep the grid covering the visible viewport.
- **`renderers/phaser/debug/PhaserDebugLayer.ts`** — composes the
  shape-aware `PhaserBoundingOutlineRenderer` and
  `PhaserHeadingArrowRenderer`, toggled via `setOptions`. The option
  shape (`showBoundingOutlines`, `vehicleBoundingOutlineShape`)
  mirrors `ThreeDebugLayer` so a single Inspector control drives both
  adapters.
- **`renderers/phaser/debug/PhaserBoundingOutlineRenderer.ts`** —
  shape-aware debug outline. Draws stroked `Arc`s for circles and
  stroked `Rectangle`s for rectangles (rotated via
  `simYawToPhaserRotation`). Delegates shape selection to the shared
  `src/ui/renderers/debug/resolveBoundingOutline.ts` helper so the
  Three.js and Phaser outputs stay byte-equivalent when it comes to
  which entity gets which shape. Read-only; collision/replay remain
  untouched.
- **`renderers/debug/DebugOverlayConfig.ts`** and
  **`renderers/debug/resolveBoundingOutline.ts`** — adapter-agnostic
  shared pieces. `DebugOverlayConfig` is the single React-level state
  the Inspector writes to; `resolveBoundingOutline` is the pure
  function that maps an entity to its outline shape (`circle` or
  `rectangle`). Both imported by Three and Phaser debug renderers so
  adding a third adapter later only requires a new drawer, not a new
  decision tree.
- **`renderers/phaser/objects/VisualStyle.ts`** — Phaser-side color
  / size constants. Kept independent of the Three.js style file
  because Phaser uses `0xRRGGBB` ints whereas Three uses CSS
  strings; centralizing avoids hex/string conversions at every
  draw site.
- **`renderers/phaser/config/PhaserRendererConfig.ts`** — config
  type and defaults. Includes `pixelsPerMeter`, `showGrid`,
  `showAxes`, `showDebug`, `showTrails`, `backgroundColor`, and a
  trail sub-config (`PhaserTrailConfig`) that's an
  intentionally-narrower subset of `ThreeTrailConfig` — Phaser
  uses point-count sampling only.

### Adding a new renderer (Pixi, Canvas 2D, WebGPU)

1. Create `src/ui/renderers/<name>/` with the same internal split
   (`core/`, `mapping/`, `objects/`, optionally `cameras/`,
   `config/`, `debug/`).
2. Implement `SimulationRenderer` in
   `src/ui/renderers/<name>/core/<Name>SimulationRenderer.ts`.
3. Add `src/ui/viewport/<Name>SimulationViewport.tsx`.
4. Add the `RendererType` literal in
   `src/ui/viewport/RendererType.ts`, a `case` in
   `SimulationViewportSwitcher`, and an `<option>` in the
   renderer selector inside `ControlPanel`.

Every existing renderer-agnostic invariant (mapping in one place,
sub-renderers per entity type, registry-based lifecycle, full
disposal of GPU/native handles) carries over verbatim.

## Layer 10 — collision adapters (`src/infrastructure/collision/`)

Heavy collision backends — the kind that drag in WASM, vendor
runtimes, or large dependencies — live in `infrastructure/`, not in
the simulation core. They depend on `simulation/collision/`'s
contracts and never the other way round, mirroring how transports
relate to the communication layer.

### Rapier 2D backend (`src/infrastructure/collision/rapier/`)

- **`RapierCollisionBackend2D`** — implements `CollisionBackend2D`
  using `@dimforge/rapier2d-compat`. Constructed via the async factory
  `RapierCollisionBackend2D.create()` because Rapier's WASM runtime
  needs `RAPIER.init()` before any class is usable. The `compat`
  flavor inlines the WASM as base64 so no extra Vite asset wiring is
  required.
- **`RapierShapeMapper2D`** — single-purpose translator from
  `CollisionShape2D` to `RAPIER.ColliderDesc`. Circles → `ball`;
  oriented boxes → `cuboid(width/2, length/2)`. Position / rotation
  are NOT set here — they belong on the parent `RigidBodyDesc`.

#### Phase 1 strategy (current)

`detect()` builds a fresh zero-gravity `World`, creates one **fixed**
rigid body per input shape at its current simulation pose, attaches a
collider, calls `world.step()` once with `timestep = 0` to populate
the narrow phase, enumerates contact pairs via
`world.forEachCollider` + `world.contactPairsWith`, deduplicates the
symmetric reports, optionally extracts a manifold normal +
penetration depth via `world.contactPair`, frees the world.

Wasteful but **stateless and contract-equivalent** to
`SimpleCircleCollisionBackend2D`, which means the two backends can be
swapped without behavioral change. The simulation state remains the
sole source of truth for entity poses; Rapier neither moves bodies
nor writes back to entities.

#### Phase 2+ TODOs (deliberately not implemented yet)

- Cache the Rapier `World` and reuse colliders frame-to-frame; diff
  against `state` for entity add/remove and update body translations
  / rotations in place.
- Use the broad phase to prune candidate pairs.
- Drive vehicle dynamics from Rapier rigid bodies and synchronize
  poses back into entities (a separate `RapierDynamicsSystem`, not
  inside this backend).
- Sensor / trigger volumes via `intersectionPair`.
- Hoist Rapier into a WebWorker.
- 3D collision via Rapier 3D when the simulator gains ramps /
  volumetric scenarios.

#### Coordinate convention

Simulation X/Y maps directly to Rapier 2D X/Y. There is no axis
remapping at the collision layer (the +Y → +Z swap in
`ui/renderers/three/mapping/` is a Three.js concern only and never
touches collision truth). Vehicle yaw maps directly to Rapier 2D's
body rotation angle.

### Forbidden imports

- `simulation/collision/*` MUST NOT import
  `infrastructure/collision/...` or `@dimforge/rapier2d-compat`.
- `simulation/entities/*`, `simulation/core/*`, and `math/*` MUST
  NOT import Rapier.
- `ui/renderers/...` MUST NOT import Rapier as the source of
  collision truth — visualization-only consumption of `collision`
  events is fine.
- `infrastructure/collision/rapier/*` MUST NOT import Three.js or
  any other rendering library.

### Composition

Engine wiring lives at the composition root only.
`SimulationProvider.tsx` accepts an optional `collisionConfig` prop
(default: `DEFAULT_COLLISION_CONFIG = { backend: 'simpleCircle2D' }`)
and maps the `CollisionBackendType` to a concrete backend
synchronously:

```ts
// Synchronous path — what `SimulationProvider` does today.
// Supports `'disabled'` and `'simpleCircle2D'`; throws for
// `'rapier2D'` because that backend cannot be built without `await`.
const backend =
  collisionConfig.backend === 'disabled'
    ? new NoopCollisionBackend2D()
    : new SimpleCircleCollisionBackend2D()
engine.addSystem(new CollisionSystem(backend))
```

`'rapier2D'` is intentionally NOT supported through the synchronous
provider, because `RapierCollisionBackend2D.create()` returns a
`Promise`. To enable Rapier, wire the engine through an async setup
step (a custom provider, a top-level `await` at the entry point, or
a small loader component that suspends until the backend is ready):

```ts
// Async wrapper — only needed when you want Rapier. `SimulationProvider`
// itself stays synchronous; the async setup belongs in the caller.
const backend =
  collisionConfig.backend === 'rapier2D'
    ? await RapierCollisionBackend2D.create() // resolves a WASM module
    : collisionConfig.backend === 'disabled'
      ? new NoopCollisionBackend2D()
      : new SimpleCircleCollisionBackend2D()
engine.addSystem(new CollisionSystem(backend))
```

Keeping the synchronous and async paths visibly separate is the
point: React's synchronous render is never blocked on WASM by
default, and any `await` is opt-in at the call site.

`'disabled'` is the recommended way to turn collisions off: it keeps
`CollisionSystem` in the pipeline, so `'collision'` event semantics,
metrics counters, and the registration order remain comparable
across configurations.

## Layer 11 — input adapters (`src/ui/input/`)

Browser-side producers that translate user input into addressed
`VehicleCommand`s on the shared `VehicleCommandQueue`. They live in
`ui/` because they touch `window` / `KeyboardEvent`; the simulation
core never references DOM types.

- **`KeyboardInputSource`** — pure observer that tracks the live set
  of pressed keys via `keydown` / `keyup` listeners. Lowercases keys
  for case-insensitive lookup, ignores events targeting `<input>`
  / `<textarea>` / `<select>` / `contenteditable` elements (so
  typing into the inspector doesn't drive the car), prevents the
  browser's default page-scroll for the four arrow keys, and clears
  pressed state on `blur` to avoid runaway vehicles after alt-tab.
  Knows nothing about vehicles or commands.
- **`KeyboardVehicleCommandMapper`** — stateless projection from a
  `KeyboardInputSource` snapshot to a single `VehicleCommand`.
  Bindings: `ArrowUp/I` → forward, `ArrowDown/K` → reverse,
  `ArrowLeft/J` → CCW, `ArrowRight/L` → CW. Opposing keys cancel
  additively; using both an arrow and its IJKL twin contributes
  once. Free of any `VehicleEntity` knowledge.
- **`useKeyboardVehicleControl`** — React hook. Reads the
  `commandQueue` from `SimulationContext`, attaches a
  `KeyboardInputSource`, and on every engine `tick` event pushes
  `mapper.createCommand(simTime)`. A command is pushed **every**
  tick, including ticks where no key is held — that explicit
  zero-velocity command is what makes "release-to-stop" work given
  `setCommand`'s sticky semantics. The effect's cleanup pushes a
  final zero command for the (previously) controlled `vehicleId` so
  disabling, swapping vehicles, or editing speeds doesn't leave the
  vehicle coasting.
- **`SimulatorKeyboardControls`** — headless component (`return
  null`) that forwards a `KeyboardControlUiState` from `App.tsx`
  into the hook. Renders nothing.
- **`KeyboardControlState.ts`** — `KeyboardControlUiState` (`enabled`,
  `vehicleId`, `forwardSpeed`, `reverseSpeed`, `angularSpeed`),
  `DEFAULT_KEYBOARD_CONTROL_UI_STATE`, and
  `deriveKeyboardControlState(interaction)` which seeds the UI state
  from `scenario.interaction.keyboardControl` (filling in module
  defaults for any field the scenario didn't declare).
- **`KeyboardControlPanel`** — Inspector UI for the live state. Edits
  apply immediately; no simulation restart needed. The panel is the
  runtime source of truth; scenario `interaction.keyboardControl`
  only seeds the initial values.

Scenario → UI flow on load:

```text
ControlPanel
  ├── ScenarioLoader.loadFromUrl(url)         (parse + validate)
  ├── onScenarioLoaded(spec)  ─────────────▶  AppShell
  │                                              ├── lastInteractionRef = spec.interaction
  │                                              └── setKeyboardControlState(deriveKeyboardControlState(spec.interaction))
  └── controller.loadScenarioFromJson(spec)   (engine.reset → scenarioLoaded)
                                                 │
                                                 └─▶ AppShell.useEffect on engine 'reset'
                                                       └── reapplies defaults from lastInteractionRef
```

The keyboard-control UI state is therefore reapplied on **every**
engine reset — manual Reset and the implicit reset inside
`loadScenario` — using the most recently loaded scenario's
interaction config.

Architectural rule: the keyboard never mutates `VehicleEntity`,
`SimulationState`, or any pose / yaw / velocity directly. The only
write path is `commandQueue.push(...)`, drained by
`VehicleCommandSystem` during the next tick.

Browser keyboard events do not create commands directly. They only
update key state in `KeyboardInputSource`. Commands are generated on
engine tick by `useKeyboardVehicleControl`, which samples the input
source, runs `KeyboardVehicleCommandMapper`, and pushes the resulting
`VehicleCommand` into `VehicleCommandQueue`. This decoupling is why
key autorepeat doesn't burst the queue and why a held key still
produces commands every tick (including the explicit zero-velocity
command on key release).

The same boundary is reusable for joystick / gamepad / touchscreen
adapters: build a new `*VehicleCommandMapper` and a hook that pushes
to the same queue.

Forbidden imports inside `ui/input/`: anything from
`infrastructure/`, anything from `simulation/render/` or
`simulation/collision/` internals (the public command type is fine).

## Tick pipeline (control flow)

```
SimulationLoop  ──tick(dt)──▶  SimulationEngine.tick
                                 │
                                 ├─ clock.tick(dt)
                                 ├─ systems.update(dt, state)
                                 │     ├─ ScenarioSystem         → applies scheduled events
                                 │     ├─ VehicleCommandSystem   → drains VehicleCommandQueue
                                 │     │                            └─ vehicle.setCommand(...)
                                 │     ├─ VehicleDynamicsSystem  → entity.update(dt, state)
                                 │     ├─ CollisionSystem        → emits 'collision'
                                 │     ├─ MetricsSystem
                                 │     └─ CommunicationSystem    → drives PeriodicPublishers
                                 │                                  └─ TopicBridges → Transport.publish(...)
                                 ├─ state.metrics.ticks += 1
                                 └─ events.emit('tick', …)
                                            │
                                            ├──▶ React hooks (useSyncExternalStore)
                                            │           │
                                            │           ▼
                                            │   Re-render only the subscribed leaves
                                            │
                                            │   (input adapters such as
                                            │    useKeyboardVehicleControl also
                                            │    subscribe to 'tick' — see the
                                            │    "Browser input" sub-diagram below)
                                            │
                                            └──▶ ThreeSimulationViewport
                                                        │
                                                        ▼
                                          renderer.render(engine.state)
                                                        │
                                                        ├─ sub-renderers .sync(state)
                                                        ├─ camera controller .update(state)
                                                        └─ WebGLRenderer.render(scene, camera)

  Browser input  ──keydown / keyup──▶  KeyboardInputSource
                                              │
                                              │  stores pressed keys only
                                              ▼
                                       (no command is created here)

  engine tick  ─────────────────────▶  useKeyboardVehicleControl
                                              │  samples KeyboardInputSource
                                              ▼
                                       KeyboardVehicleCommandMapper
                                              │
                                              ▼
                                       commandQueue.push(VehicleCommand)
                                              │
                                              ▼
                                       VehicleCommandSystem
                                              │
                                              ▼
                                       vehicle.setCommand(...)

  External world  ──Transport.subscribe──▶  TopicBridge
                                              │
                                              └─ adapter.toInternal()
                                                       │
                                                       ▼
                                              commandQueue.push(...)
                                                       │
                                                       └─ drained next tick by
                                                          VehicleCommandSystem
                                                                    │
                                                                    ▼
                                                          vehicle.setCommand(...)
```

### Command-flow invariant

> Only systems mutate simulation state during a tick.
> Only `VehicleCommandSystem` applies a `VehicleCommand` to a
> `VehicleEntity`.
> Renderers and transports never mutate entities directly.

Every command producer — keyboard hooks, the WebSocket / ROS2 bridge,
scenario events, Python planners, joysticks, UI buttons — pushes a
`VehicleCommand` into the **same** `VehicleCommandQueue`.
`VehicleCommandSystem` is the only code path that calls
`vehicle.setCommand(...)`. This is what makes the simulator
deterministic, replayable, and renderer/transport-agnostic.

## Extension points

- **New entity** — extend `BaseEntity`, implement `update(dt, state)`,
  add a discriminated variant to `EntitySpec`, and a `case` in
  `ScenarioLoader.buildEntity`.
- **New system** — implement `SimulationSystem`, register it via
  `engine.addSystem(...)` (order matters; systems run in registration
  order).
- **New event** — add a key + payload to `SimulationEvents`; `emit` /
  `on` are typed against the map.
- **New renderer** — implement `SimulationRenderer` in a separate
  module under `src/ui/` (or its own package), read from
  `SimulationState`, and never mutate it. Apply the handedness mapping
  documented in `Considerations.md`.
- **New transport** — implement `Transport` under
  `src/infrastructure/communication/<wire>/`. Bridges and adapters do
  not need to change.
- **New UI communication capability** — define the generic type/hook in
  `src/app/`, expose it from `CommunicationContext`, and implement any
  vendor-specific behavior under
  `src/infrastructure/communication/<wire>/`. UI components consume the
  generic capability only.
- **New external schema** — implement `MessageAdapter<TWire, TSim>`
  under `src/infrastructure/communication/<wire>/` (or a dedicated
  integration package). Engine code does not change.
- **New bridge** — implement `TopicBridge` under
  `src/simulation/communication/bridges/`. Wire it through
  `start()`/`stop()` from your provider; if it's a publisher, drive
  it with a `PeriodicPublisher` inside `CommunicationSystem`.
- **New input device** — add a `*InputSource` and a
  `*VehicleCommandMapper` under `src/ui/input/` (or a new sibling
  directory). Push `VehicleCommand`s onto the shared `commandQueue`
  on each engine `tick`. Do not modify entities directly.

## Tests (vitest)

- `src/math/geometry/operations2D.test.ts` — vector ops (12 tests)
- `src/simulation/core/SimulationClock.test.ts` — clock (7 tests)
- `src/simulation/entities/VehicleEntity.test.ts` — kinematic update,
  including semi-implicit step verification (6 tests)
- `src/simulation/scenarios/ScenarioLoader.test.ts` — parse +
  `buildEntity` + `loadFromUrl` with injected `fetch`, plus
  `interaction.keyboardControl` validation: full block, missing
  block, partial fields, default `vehicleId = "ego"` when enabled
  with no id, type-coercion failures (boolean / string / non-finite
  / negative), tolerant of unknown vehicleId at parse time (35 tests)
- `src/simulation/commands/VehicleCommandQueue.test.ts` — FIFO
  ordering, drain semantics, defensive-copy on drain, clear (6 tests)
- `src/simulation/commands/VehicleCommandSystem.test.ts` — drains
  the queue, applies via `setCommand`, drops missing /
  non-vehicle ids, last-write-wins, `reset` clears, sticky-field
  preservation (7 tests)
- `src/ui/input/KeyboardVehicleCommandMapper.test.ts` — zero state,
  arrow + IJKL bindings, sign convention, opposing-key cancellation,
  no double-count when both key aliases are held, timestamp /
  vehicleId pass-through (9 tests)
- `src/ui/input/KeyboardControlState.test.ts` — `deriveKeyboardControlState`
  returns defaults for missing interaction / keyboardControl, partial
  overrides preserve other defaults, and each call returns a fresh
  copy (5 tests)
- `src/simulation/communication/PeriodicPublisher.test.ts` — period
  enforcement, dt validation, reset, async-callback detachment
  (6 tests)
- `src/simulation/communication/adapters/JsonVehicleCommandAdapter.test.ts`
  — round-trip + `source` defaulting + strict validation of
  `vehicleId`, finite numeric fields, and known source tags
  (8 tests)
- `src/simulation/communication/bridges/VehicleCommandTopicBridge.test.ts`
  — subscribes / unsubscribes correctly, decodes through the adapter,
  pushes onto `VehicleCommandQueue` (never calls `setCommand`),
  queues commands with unknown `vehicleId` (routing decision belongs
  to `VehicleCommandSystem`), drops malformed messages, optional
  `Logger` (6 tests)
- `src/simulation/communication/bridges/VehicleStatePublisherBridge.test.ts`
  — snapshot shape, silent when target absent, silent before
  `start()` (3 tests)
- `src/simulation/communication/bridges/ClockPublisherBridge.test.ts`
  — sim-time / dt / tick fields, lifecycle (3 tests)
- `src/infrastructure/communication/mock/MockTransport.test.ts`
  — connect/publish/subscribe/unsubscribe, topic isolation, recorded
  history, handler-failure isolation (7 tests)
- `src/infrastructure/communication/memory/InMemoryTransport.test.ts`
  — microtask dispatch ordering, lifecycle, subscription clearing
  (4 tests)
- `src/simulation/collision/CollisionPairKey.test.ts` —
  order-independence, lexicographic ordering, stability, degenerate
  same-id pairs (4 tests)
- `src/simulation/collision/SimpleCircleCollisionBackend2D.test.ts`
  — overlap / no-overlap / touching / penetration depth / unit
  normal / coincident centers / deterministic order / no input
  mutation / oriented-box pass-through (9 tests)
- `src/simulation/collision/NoopCollisionBackend2D.test.ts` —
  name, empty input, overlapping shapes still empty, no input
  mutation, `reset` / `dispose` no-throw (6 tests)
- `src/simulation/collision/buildCollisionShapes2DFromState.test.ts`
  — empty state, vehicle / static obstacle / dynamic actor mapping,
  insertion-order preservation, no entity mutation (6 tests)
- `src/simulation/systems/CollisionSystem.test.ts` — backend
  delegation, leading-edge events, re-fire after separation,
  lexicographic (a, b) ordering with normal flip, intra-tick
  deduplication, `reset` clears active pairs and forwards to
  backend, `dispose` forwards (7 tests)
- `src/infrastructure/collision/rapier/RapierCollisionBackend2D.test.ts`
  — async `create()`, empty input, circle / circle-vs-OBB /
  OBB-vs-OBB overlap, no false positives on +Y separation
  (axis-remap canary), no symmetric duplicates, no input mutation,
  finite penetration depth (9 tests)
- `src/ui/renderers/three/mapping/simToThree.test.ts` — sim ↔ three
  point/vector mapping + yaw identity under the right-handed mapping
  + round-trip through `threeToSim` (8 tests)
- `src/ui/renderers/phaser/mapping/simToPhaser.test.ts` — sim ↔
  phaser point / vector / length mapping (origin placement, +Y
  flip, fractional pixelsPerMeter), yaw direction (CCW sim ↔ CCW on
  screen via `-yaw`), zero edge cases, and round-trips through
  `phaserToSim` (15 tests)
- `src/ui/renderers/three/core/ThreeRenderObjectRegistry.test.ts` —
  set / get / iteration order / delete / clear (3 tests)
- `src/ui/renderers/three/core/threeDisposal.test.ts` — geometry +
  single material + multi-material + nested children + texture-map
  disposal (5 tests)
- `src/ui/renderers/three/objects/ThreeTrajectoryRenderer.test.ts` —
  reads `state.trajectories`, one line per entity, stale line removal,
  `simPoint2DToThree`, no registry mutation, disposal (7 tests)
- `src/simulation/recording/SimulationRecorder.test.ts` — start
  requires `enabled`, stop preserves frames, clear resets cap flag,
  `maxFrames` auto-stop, `setConfig({enabled:false})` halts recording,
  config sanitization, `toReplayFile` envelope shape + JSON
  round-trip (10 tests)
- `src/simulation/recording/createSnapshotFromState.test.ts` — vehicle
  / static obstacle / dynamic actor / generic fallback shapes,
  `metrics.ticks + 1` tick numbering, JSON round-trip, no state
  mutation (7 tests)
- `src/simulation/recording/SimulationRecorderSystem.test.ts` —
  default cadence, `sampleEveryNTicks`, ticks aligned with engine,
  `recordingMaxFramesReached` + `recordingStopped` on auto-stop,
  `reset` clears cadence counter, no entity mutation (7 tests)
- `src/simulation/recording/architecture.recording.test.ts` —
  enforces no React / Three / Phaser / Node `fs|path` / `src/ui` /
  `src/app` imports inside `src/simulation/recording/`
- `src/simulation/core/SimulationEngine.recording.test.ts` —
  `engine.recorder` exposed, `startRecording` is a no-op when
  disabled, single-fire `recordingStarted` / `recordingStopped`,
  cadence integration with the engine tick loop, exported envelope
  carries `fixedDtSec` and `scenarioName`, `loadScenario` clears
  recording (12 tests)
- `src/ui/replay/buildReplayFileName.test.ts` — base-name fallback
  chain (option → scenarioName → "simulation"), deterministic
  timestamp via `options.now`, `.angy-replay.json` suffix, sanitizer
  for filesystem-unfriendly characters, length cap, JSON
  serialization round-trip (10 tests)
- `src/ui/replay/downloadReplay.test.ts` — DOM-side
  (`@vitest-environment happy-dom`); creates a `Blob` of type
  `application/json`, builds an anchor with the expected `download`
  attribute, click + revoke flow, anchor cleanup even when the click
  handler throws (5 tests)
- `src/ui/replay/architecture.replay.test.ts` — UI replay layer
  cannot import `SimulationRecorder` / `SimulationRecorderSystem`;
  imports from `src/simulation/recording/` are limited to the public
  surface (`ReplayFormat`, `SimulationFrameSnapshot`, `ReplaySession`,
  `createReplayStateFromFrame`); `src/simulation/recording/**`
  cannot import `src/ui/replay/**`; sibling UI panels do not import
  the downloader; covers both `.ts` and `.tsx` files
- `src/simulation/recording/ReplaySession.test.ts` — frame-count /
  duration / fixed-dt accessors, empty-replay rejection,
  `seekToFrame` clamping, `seekToTime` first-frame-≥-t policy,
  `stepForward / stepBackward` clamping, `onChange` fires only on
  real index movement, `reset` returns to index 0, unsubscribe
  drops further notifications, `getFrame(index)` clamping without
  cursor movement, single-frame duration is 0 (11 tests)
- `src/simulation/recording/createReplayStateFromFrame.test.ts` —
  `clock.time()` / `clock.dt()` reflect the recorded frame,
  non-finite/zero `fixedDtSec` falls back gracefully, vehicle /
  static obstacle / dynamic actor reconstruction, generic entities
  skipped, `entities.toArray|all|byType` work, `paths` /
  `trajectories` registries are empty (Phase 3 limitation), legacy
  dynamic-actor `position` fallback, metrics mirror the snapshot
  (10 tests)
- `src/ui/replay/parseReplayJson.test.ts` — accepts a well-formed
  envelope, descriptive error on invalid JSON, rejects non-object
  roots, wrong format tag, unsupported version, non-positive
  `fixedDtSec`, missing/empty/non-array `frames`, frames with
  non-finite `tick` / `timeSec`, non-array entities, and reports
  the offending frame index (12 tests)
- `src/ui/replay/ReplayPlayer.test.ts` — starts paused, `play()`
  schedules forward steps, walks to the last frame and auto-pauses,
  `pause()` cancels the scheduled callback, toggle, speed clamping,
  faster speed advances more frames per real-time interval, play()
  at the last frame is a no-op, dispose is idempotent (8 tests, all
  with an injected scheduler so no DOM is required)

WebGL-bound renderer code (lights, `WebGLRenderer`, full `init`) is
intentionally not unit-tested under vitest's `node` environment —
those paths are exercised in the running app. Headless WebGL would
require `jsdom` + a software GL backend, which is overkill for this
project right now.
