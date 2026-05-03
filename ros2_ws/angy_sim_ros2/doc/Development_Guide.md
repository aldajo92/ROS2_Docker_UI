# Development Guide

Use this guide together with `Architecture.md`.

The goal is to keep `angy_sim_ros2` modular, deterministic, renderer-agnostic, and transport-agnostic.

---

## Core Rules

### 1. Keep the core isolated

Do not import these inside `src/simulation/` or `src/math/`:

```text
React
Three.js
Phaser
Pixi
Canvas / DOM APIs
WebSocket APIs
ROS2
DDS
Rapier
renderer-specific code
transport-specific code
infrastructure code
```

Allowed dependency direction:

```text
ui/                 -> may import simulation contracts
infrastructure/     -> may import simulation contracts
simulation/         -> must not import ui or infrastructure
math/               -> must stay pure
```

---

### 2. Only systems mutate simulation state

Simulation state should only change inside:

```text
SimulationSystem.update(dt, state)
```

Do not mutate entities from:

```text
React components
Three.js renderers
Phaser renderers
keyboard handlers
WebSocket callbacks
Topic bridges
```

---

### 3. Vehicle commands always go through the queue

Required flow:

```text
Producer
  -> VehicleCommand
  -> VehicleCommandQueue
  -> VehicleCommandSystem
  -> VehicleEntity.setCommand(...)
```

Valid producers:

```text
keyboard
joystick
UI buttons
scenario events
WebSocket bridge
ROS2 bridge
Python planner
tests
```

Only `VehicleCommandSystem` may call:

```ts
vehicle.setCommand(...)
```

---

### 4. Renderers are read-only

Renderers may read `SimulationState`.

Renderers must not:

```text
mutate entities
mutate SimulationState
emit engine events
compute physics
compute official collisions
schedule simulation ticks
```

Three.js, Phaser, Pixi, Canvas, or WebGPU are visualization adapters only.

Renderer-only state (e.g. `ThreeTrajectoryVisualizationConfig` for
line color/height, debug-layer toggles) lives in React state and is
pushed into the Three.js renderer. **Trajectory history** lives in
`SimulationState.trajectories` and is configured via
`TrajectoryTrackingSystem` / `controller.setTrajectoryTrackingConfig` —
not in the renderer. Never store actual trajectory samples in renderer
code or on entities. Never store visualization-only fields in
`SimulationState` or scenario JSON.

---

### 5. Collision goes through backends

Collision flow:

```text
CollisionSystem
  -> buildCollisionShapes2DFromState(state)
  -> CollisionBackend2D.detect(shapes)
  -> collision events / metrics
```

Backends live behind `CollisionBackend2D`.

Examples:

```text
NoopCollisionBackend2D            -> src/simulation/collision/
SimpleCircleCollisionBackend2D    -> src/simulation/collision/
RapierCollisionBackend2D          -> src/infrastructure/collision/rapier/
```

Two-tier rule:

```text
Dependency-free / built-in backends (Noop, SimpleCircle):
  src/simulation/collision/

Vendor-heavy / WASM / native backends (Rapier, Matter.js, Box2D):
  src/infrastructure/collision/<vendor>/
```

`src/simulation/collision/` must stay free of `@dimforge/rapier2d-compat`
and any other vendor dependency.

Selection happens at the composition root via `CollisionConfig.backend`:

```text
'disabled'        -> NoopCollisionBackend2D       (synchronous)
'simpleCircle2D'  -> SimpleCircleCollisionBackend2D (synchronous, default)
'rapier2D'        -> RapierCollisionBackend2D     (async — opt-in only)
```

`SimulationProvider` is synchronous and only handles the first two;
Rapier requires an async setup at the call site.

---

### 6. Communication is transport-agnostic

Engine-side communication uses:

```text
Transport
MessageAdapter
TopicBridge
PeriodicPublisher
CommunicationSystem
```

Concrete transports live under:

```text
src/infrastructure/communication/
```

Inbound command bridges must push to `VehicleCommandQueue`.

They must not mutate vehicles directly.

Transport-specific dependencies stay inside their infrastructure
folder. For example, `roslibjs` may only be imported under:

```text
src/infrastructure/communication/rosbridge/
```

The React shell may expose optional communication capabilities through
`CommunicationContext`, but the capability types must stay generic:

```text
TopicDiscovery    -> topics/status/error/lastUpdated/refresh
TopicEcho         -> sessions/startEcho/stopEcho/closeEcho
RenderableTopics  -> isRenderable/getUnsupportedReason/isSelected/
                     selectTopic/deselectTopic/selectedTopics
```

UI panels consume those generic capabilities only. `Ros2TopicsPanel`
and `EchoCard` must not import `roslib`, rosapi service types, ROS
message schemas, or any transport implementation directly.

Renderable-topic data flow (rosbridge example):

```text
rosbridge subscription
  -> RosPathToPath2DAdapter (infrastructure/communication/rosbridge/adapters/)
  -> ExternalPathUpdateQueue.enqueueUpsert()                 (simulation/paths/)
  -> [next tick]
  -> ExternalPathRenderSystem.update(...) drains the queue   (simulation/systems/)
  -> state.paths                                              (read by Three / Phaser path renderers)
```

External callbacks **must not** call `state.paths.add(...)` directly.
The queue + system handoff is what lets the simulator stay
deterministic and replayable.

---

### 7. Renderer-specific mapping is centralized

Each renderer adapter has exactly one module that knows how to map
simulation coordinates and yaw onto its target frame. Object
renderers, debug layers, and camera controllers must never
reimplement these conversions inline.

Three.js mapping (right-handed, +Y up in three):

```text
src/ui/renderers/three/mapping/
  sim.x -> three.x
  sim.y -> -three.z
  sim.z -> three.y
  yaw   -> rotation.y = yaw
```

Phaser mapping (2D canvas, +X right, +Y screen-down by default; we
flip Y so simulation +Y appears upward):

```text
src/ui/renderers/phaser/mapping/
  phaser.x = originX + sim.x * pixelsPerMeter
  phaser.y = originY - sim.y * pixelsPerMeter
  rotation = -yaw   (because we flipped screen Y)
```

---

## Where to Add Things

```text
New simulation behavior:
  src/simulation/systems/
  src/simulation/entities/

New vehicle command logic:
  src/simulation/commands/

New renderer:
  src/ui/renderers/<renderer-name>/
  src/ui/viewport/

New Three.js visual:
  src/ui/renderers/three/objects/

New Three.js debug visual:
  src/ui/renderers/three/debug/

New Phaser visual:
  src/ui/renderers/phaser/objects/

New Phaser debug visual:
  src/ui/renderers/phaser/debug/

New input device:
  src/ui/input/

New transport:
  src/infrastructure/communication/<transport-name>/

New message adapter:
  src/infrastructure/communication/<transport-name>/
  or src/simulation/communication/adapters/ if generic

New collision backend (dependency-free / built-in):
  src/simulation/collision/

New collision backend (vendor-heavy / WASM / native):
  src/infrastructure/collision/<vendor>/

New collision contract:
  src/simulation/collision/

New scenario feature:
  src/simulation/scenarios/
  src/simulation/systems/ScenarioSystem.ts
```

---

## Required System Order

Default order:

```text
ScenarioSystem
VehicleCommandSystem
VehicleDynamicsSystem
TrajectoryTrackingSystem
CollisionSystem
MetricsSystem
SimulationRecorderSystem
CommunicationSystem optional
```

Rules:

```text
VehicleCommandSystem must run before VehicleDynamicsSystem.
TrajectoryTrackingSystem must run after VehicleDynamicsSystem (samples integrated poses).
CollisionSystem must run after VehicleDynamicsSystem.
SimulationRecorderSystem must run last (snapshots final post-tick state).
CommunicationSystem should run after dynamics, collisions, and metrics.
```

---

## Before Implementing

Before changing code, answer:

```text
1. Which layer does this change belong to?
2. Which files will be modified?
3. Does it introduce a forbidden import?
4. Does it mutate SimulationState?
5. If it controls a vehicle, does it use VehicleCommandQueue?
6. If it visualizes something, is it renderer-only?
7. If it detects collisions, does it use CollisionBackend2D?
8. Does it need tests?
```

---

## Implementation Checklist

```text
[ ] Dependency direction is valid.
[ ] No renderer/framework/vendor imports inside simulation/math.
[ ] No direct entity mutation outside systems.
[ ] Vehicle commands go through VehicleCommandQueue.
[ ] Collisions go through CollisionBackend2D.
[ ] Renderer-specific mapping helpers are used (simToThree / simToPhaser).
[ ] Tests were added or updated if behavior changed.
[ ] Architecture.md is updated only if a design decision changed.
```

---

## Common Mistakes

### Bad: Three.js in the core

```ts
import * as THREE from "three";
```

inside `src/simulation/` or `src/math/`.

### Bad: keyboard moves the vehicle directly

```ts
vehicle.pose.position.x += 1;
```

### Bad: WebSocket mutates the vehicle

```ts
vehicle.setCommand(command);
```

inside a transport or bridge.

### Bad: renderer decides official collision

```text
THREE.Box3 intersection -> collision event
```

Correct path:

```text
CollisionSystem -> CollisionBackend2D -> collision event
```

### Bad: duplicated coordinate mapping

```ts
mesh.position.set(x, 0, -y);
mesh.rotation.y = yaw;
```

Even when the numbers match the current mapping, hardcoding them
duplicates the rule from `simToThree.ts`. If the mapping ever
changes again, every duplicate site silently goes stale.

Correct path:

```ts
mesh.position.copy(simPoint2DToThree(point, height));
mesh.rotation.set(0, simYawToThreeRotationY(yaw), 0);
```

### Bad: keyboard event pushes a command directly

```ts
window.addEventListener('keydown', (e) => {
  commandQueue.push(commandFromKey(e));
});
```

`keydown` and `keyup` should only update key state in
`KeyboardInputSource`. Commands are produced on each engine tick by
`useKeyboardVehicleControl` (sampling the input source through
`KeyboardVehicleCommandMapper`), which keeps the rate deterministic
and prevents key autorepeat from bursting the queue.

Correct path:

```text
keydown / keyup    -> KeyboardInputSource.pressedKeys (state only)
engine 'tick'      -> useKeyboardVehicleControl
                    -> KeyboardVehicleCommandMapper
                    -> commandQueue.push(VehicleCommand)
```

---

### Bad: storing actual trajectory **samples** in the renderer

```ts
// in ThreeTrajectoryRenderer.sync — WRONG
state.trajectories.append(...)
```

Actual trajectory history belongs in `SimulationState.trajectories`,
written only by `TrajectoryTrackingSystem`. Renderers read and draw.

Correct paths:

```text
Trajectory sampling:
  TrajectoryTrackingSystem  ──▶  state.trajectories

Three.js visualization (style only):
  React state (App.tsx)  ──ThreeTrajectoryVisualizationConfig──▶
  ThreeSimulationViewport → ThreeSimulationRenderer.setTrajectoryVisualizationConfig(...)
       └──▶ ThreeTrajectoryRenderer.sync(state)   // read-only
```

Inspector splits **tracking** (`TrajectoryTrackingConfig` →
`controller.setTrajectoryTrackingConfig`) from **visualization**
(height, color, opacity, line width → renderer).

Clearing **data**: `controller.clearTrajectories()`. Clearing **GPU
lines only**: `clearTrajectoryRenderCache()` on the Three renderer.

---

### Bad: building or reading replay frames inside a renderer

```ts
// in ThreeSimulationRenderer.render — WRONG
const snap = createSnapshotFromState(state)
this.recorder.append(snap)
```

Recording is **simulation-owned**. Renderers and React components are
**read-only consumers** of `SimulationState`. The only sanctioned
write path is `SimulationRecorderSystem`, registered last in the
default tick pipeline.

Correct paths:

```text
Recording (Phase 1, simulation-side):
  SimulationRecorderSystem  ──▶  engine.recorder.append(snapshot)

UI start/stop/download (Phase 2):
  RecordingPanel  ──onStart/onStop/onClear/onDownload──▶  App.tsx
       └──▶  controller.startRecording / stopRecording / clearRecording
       └──▶  const replay = controller.exportRecording()
              downloadReplay(replay)            // src/ui/replay/

Replay loading + playback (Phase 3):
  ReplayLoadButton                                          src/ui/replay/
       └──▶ readReplayFromFile  ──▶  parseReplayJson         src/ui/replay/
                                          │
                                          ▼
                                 ReplayFileFormat (validated)
                                          │
                                          ▼
                                 App.tsx → handleReplayLoaded
                                          │
                                          ├── controller.pause()
                                          ├── controller.stopRecording()
                                          ▼
                          new ReplaySession(replay)         src/simulation/recording/
                                          │
                                          ▼
                          new ReplayPlayer(session)         src/ui/replay/
                                          │
                                          ▼
                          createReplayStateFromFrame(...)   src/simulation/recording/
                                          │
                                          ▼
                          <viewport replayState={...} />    renderer paints replay
                                                              with NO replay-specific
                                                              code in the renderer.
```

Boundaries (enforced by `architecture.recording.test.ts` and
`architecture.replay.test.ts`):

```text
src/simulation/recording/  must NOT import:
  react / three / phaser / node:fs / node:path
  src/ui/* / src/app/*
  (covers ReplaySession, createReplayStateFromFrame too)

src/ui/replay/  must NOT import:
  SimulationRecorder / SimulationRecorderSystem
Allowed sibling imports from src/simulation/recording/:
  ReplayFormat, SimulationFrameSnapshot, ReplaySession,
  createReplayStateFromFrame

src/ui/*.tsx (sibling panels) must NOT import ReplayFileDownloader.
Only the App shell (src/app/App.tsx) wires the download side effect.

Renderers (src/ui/renderers/**) must NOT contain replay-specific
branches. They consume `SimulationState`; whether it came from the
live engine or `createReplayStateFromFrame` is invisible to them.
```

### Bad: panels reading the recorder directly

```ts
// in RecordingPanel.tsx — WRONG
import { SimulationRecorder } from '../simulation/recording/SimulationRecorder'

const recorder = useSimulation().engine.recorder
recorder.start()
```

Inspector panels are **dumb / controlled components**. They receive
their state via props from `App.tsx` and call `on*` callbacks; the
shell decides what those callbacks mean (which controller method to
call, whether to download a file, etc.). This keeps panels free of
DOM/file APIs and makes them trivially testable.

Correct shape (already in `RecordingPanel.tsx`):

```text
RecordingPanel  ──props──▶  status, config, on*
App.tsx       owns         status, config, controller
              wires         on* → controller.* / downloadReplay
```

The recorder is pure data: no DOM, no timers, no FS, no network. The
file download lives in `src/ui/replay/`. The replay loader lives in
the same UI replay layer (Phase 3).

---

### Bad: running live simulation systems during replay

```ts
// in App.tsx — WRONG
function handleReplayLoaded(replay) {
  setReplayState(buildView(replay.frames[0]))
  setRunMode('replay')
  // …forgot to pause the engine. Tick keeps firing,
  // VehicleCommandSystem still drives ego, and any active
  // recording continues writing frames *while* the user is
  // scrubbing. Resimulation, not replay.
}
```

Replay is **playback of recorded frames**, not resimulation. The
golden rules:

```text
1. controller.pause() before entering replay mode.
2. controller.stopRecording() defensively (the recorder writes happen
   in SimulationRecorderSystem, which only runs while the loop ticks,
   but a stopped recording also makes the UI state honest).
3. Renderers receive `replayState` instead of `engine.state`. The
   live engine state is left untouched.
4. On exit, dispose the player + session and snap the renderer back
   to engine.state. Do NOT auto-resume the engine — the user presses
   Start again via the existing ControlPanel button.
```

The shell already does this; do not introduce a parallel path that
forgets one of the four steps.

---

### Bad: branching renderer code on replay vs live

```ts
// in ThreeSimulationRenderer.render — WRONG
if (state.__replay) {
  this.renderReplayFrame(state)
} else {
  this.renderLiveFrame(state)
}
```

Renderers are **mode-agnostic**. The replay adapter
(`createReplayStateFromFrame`) returns a `SimulationState`-shaped
view that exposes the *same public surface* renderers already use
(`state.clock.time()`, `state.entities.byType(...)`, etc.). If a
renderer needs new data for replay, extend
`SimulationFrameSnapshot` and the adapter — not the renderer.

The viewport React glue is the boundary: `ThreeSimulationViewport`
and `PhaserSimulationViewport` accept `replayState?: SimulationState`
and decide which state to hand the renderer. Below that, everything
is uniform.

---

### Bad: parsing replay files inside `src/simulation`

```ts
// in src/simulation/recording/ReplayFileLoader.ts — WRONG
import type { ReplayFileFormat } from './ReplayFormat'
export async function loadReplay(file: File) { /* … */ }
```

DOM File APIs (`File`, `FileReader`, `Blob`, `<input type="file">`)
do not belong in `src/simulation`. They live in `src/ui/replay/`.
The same boundary that keeps `src/simulation/recording/` free of
download code (Phase 2) keeps it free of upload/parse code (Phase 3):

```text
src/ui/replay/ReplayFileLoader.ts
  - parseReplayJson(text)        — pure validator
  - readReplayFromFile(file)     — DOM wrapper, calls parse
```

The pure parser is unit-tested without a DOM; the DOM wrapper is
exercised in the running app or via `happy-dom`.

---

### Bad: keyboard-control flags on `VehicleEntity` or `SimulationState`

```ts
// in VehicleEntity
this.keyboardEnabled = true
// in SimulationState
this.activeKeyboardVehicleId = 'ego'
```

Keyboard control is **interaction / UI configuration**, not a
physical property of the world. Storing it on entities or in the
state would (a) leak UI concerns into the simulation core, (b) make
headless / batch runs care about keyboard, and (c) prevent the
Inspector from overriding scenario defaults at runtime without
mutating the engine.

Correct path:

```text
scenario.interaction.keyboardControl  ──┐
                                        │ (parsed by ScenarioLoader)
                                        ▼
              ControlPanel ──onScenarioLoaded(spec)──▶ AppShell
                                                         │
                                                         ▼
                                deriveKeyboardControlState(spec.interaction)
                                                         │
                                                         ▼
                                React state (KeyboardControlUiState)
                                                         │
                                                         ├──▶ KeyboardControlPanel  (Inspector override)
                                                         └──▶ SimulatorKeyboardControls
                                                                       │
                                                                       ▼
                                                   useKeyboardVehicleControl
                                                                       │
                                                                       ▼
                                                   commandQueue.push(VehicleCommand)
```

The simulation core never reads `interaction`. Engine `reset` (manual
or implicit inside `loadScenario`) reapplies the most recently loaded
scenario's defaults, so resets are deterministic with respect to the
scenario file. Disabling the hook pushes one final
`{ linearVelocity: 0, angularVelocity: 0 }` command for the
previously controlled vehicle so it doesn't coast on its last sticky
command.

---

## When to Update Architecture.md

Update `Architecture.md` only when a real design decision changes.

Examples:

```text
changing tick loop strategy
making Rapier own dynamics
adding a Phaser renderer
changing command flow
changing collision backend contract
adding 3D collision
changing communication architecture
```

Do not update it for:

```text
colors
mesh sizes
small UI changes
CSS changes
local helper functions
minor refactors
```

---

## ROS 2 / rosbridge UI Work

When adding or changing ROS 2-facing UI, keep the UI transport-aware
only at the selection level and capability-driven everywhere else.

Allowed:

```text
ConnectionStatusPanel -> selected TransportKind, endpoint URL, status, help text
Ros2TopicsPanel       -> generic TopicDiscovery + TopicEcho capabilities
EchoCard              -> generic TopicEchoSession
CommunicationProvider -> selects RoslibRosbridgeTransport when configured
rosbridge folder      -> roslibjs, rosapi service calls, ROS message shapes
```

Forbidden:

```text
ConnectionStatusPanel importing roslib
Ros2TopicsPanel importing roslib
EchoCard importing roslib
src/simulation/ importing roslib or ROS message schemas
src/math/ importing any transport or browser APIs
```

Topic discovery and echo lifecycle rules:

```text
discover topics only when a capable transport is connected
hide common ROS system topics by default
keep topic lists collapsed by default
enable Echo only in the maximized ROS2 Topics panel
stop/close echo subscriptions on disconnect or transport changes
render echo payloads as formatted JSON in separate closeable cards
```

If a future transport supports topic discovery or echo, implement the
same generic app capability shape instead of adding transport-specific
branches inside UI components.

---

## AI Coding Assistant Instructions

When using an AI coding assistant, require it to do this before coding:

```text
1. Identify the affected layer.
2. List files it plans to modify.
3. Confirm no forbidden imports will be introduced.
4. Explain how it preserves the architecture.
5. Then implement.
```

After coding, require:

```text
1. Files changed.
2. Tests added or updated.
3. Architecture compliance summary.
```

Reject any implementation that puts renderer, browser, transport, or vendor-specific code inside `src/simulation/` or `src/math/`.

---

## Short Version

```text
Core simulates.
Systems mutate.
Commands go through the queue.
Renderers read only.
Transports adapt messages.
Collisions go through backends.
Input lives in UI.
Mapping lives in one place.
Infrastructure owns vendor-specific code.
```
