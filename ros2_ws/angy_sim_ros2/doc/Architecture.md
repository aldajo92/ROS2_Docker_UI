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
        objects/        Per-entity sub-renderers (vehicle, obstacle, …)
        cameras/        CameraController interface + modes + manager
        debug/          Bounding circles, heading arrows, etc.
        config/         ThreeRendererConfig + defaults
    *.tsx             Inspector panels (Control, Metrics, Entities, …)
  math/
    geometry/         Point/Vector/Pose/Line/Segment/Transform + ops
  simulation/
    core/             Engine, clock, loop, state, managers, controller
    entities/         Entity interface + concrete entities
    systems/          SimulationSystem interface + concrete systems
    scenarios/        Scenario type + JSON loader
    events/           Typed event bus + SimulationEvents map
    logging/          Pluggable level-filtered logger
    render/           SimulationRenderer interface (no impl)
    communication/    Transport-agnostic comms contracts + bridges
      messages/         Internal JSON-friendly message types
      adapters/         JSON adapters (validation + pass-through)
      bridges/          TopicBridge implementations
  infrastructure/
    communication/    Concrete Transports (mock, in-memory, WebSocket)
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
  `collisionCount`).
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
  isRunning`.

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
- **`StaticObstacleEntity`** — circle at a fixed `position`;
  inherits the no-op update.
- **`DynamicActorEntity`** — holonomic moving obstacle: world-frame
  velocity + scalar angular velocity, integrated directly. Useful for
  pedestrians or scripted traffic that doesn't follow a kinematic
  constraint.

## Layer 4 — systems (`src/simulation/systems/`)

- **`SimulationSystem`** — interface: `name`, `update(dt, state)`.
- **`VehicleDynamicsSystem`** — iterates vehicles + dynamic actors,
  calls their `update`, accumulates `peakSpeed` and `totalDistance`
  metrics.
- **`CollisionSystem`** — naive O(n²) circle-vs-circle pass over
  vehicles, static obstacles, and dynamic actors. Uses an `active` set
  to track ongoing pair contacts and emits a `collision` event (and
  bumps `collisionCount`) only on the **leading edge** of a contact —
  not every frame the pair is overlapping.
- **`MetricsSystem`** — placeholder for cross-cutting derived metrics.
- **`ScenarioSystem`** — fires time-scheduled scenario events when
  `state.clock.time()` crosses the event's `time`.

The `SimulationProvider` registers these four systems by default; new
systems can be added via `engine.addSystem(...)`.

## Layer 5 — scenarios (`src/simulation/scenarios/`)

- **`Scenario.ts`** — pure JSON-friendly type definitions:
  `PoseSpec`, `VehicleSpec`, `StaticObstacleSpec`,
  `DynamicActorSpec`, `EntitySpec` (discriminated by `type`),
  `ScenarioSpec`.
- **`ScenarioLoader`** — `parse(input)` validates raw JSON and throws
  a `ScenarioParseError` on failure; `loadFromUrl(url)` fetches +
  parses; `buildEntity(spec)` instantiates the concrete entity class.
  The engine's `loadScenario(spec)` resets the world, materializes
  entities, and emits `scenarioLoaded`.
- **`public/scenarios/simple-scenario.json`** — sample with one
  vehicle (v=0.5 m/s, w=0.2 rad/s), three static obstacles, and a
  dynamic actor crossing.

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
  `collision`, `entityAdded`, `entityRemoved`.
- **`Logger`** — level-filtered (`debug`/`info`/`warn`/`error`) with a
  pluggable `LoggerSink`. Defaults to a `ConsoleLoggerSink`.

## Layer 7 — React shell (`src/app/`, `src/ui/`)

- **`SimulationContext.ts`** — `createContext` lives in its own module
  so Vite's React Fast Refresh doesn't trip on mixed exports.
- **`SimulationProvider.tsx`** — builds the engine **once**, registers
  the four default systems, wraps it with a `SimulationController`,
  and exposes both via context. Pauses the engine on unmount.
- **Hooks (`useSimulation.ts`)** — all leaf-level subscriptions via
  `useSyncExternalStore`:
  - `useSimulation()` → `{ controller, engine }`
  - `useSimulationTime()` → updates on every `tick`
  - `useSimulationRunning()` → updates on `started`/`paused`/`reset`
  - `useEntityListVersion()` → updates on entity add/remove + tick
- **UI components (`src/ui/`)** —
  `ControlPanel` (Start / Pause / Step / Reset / Load Scenario),
  `SimulationTimeDisplay`, `MetricsPanel`, `EntityListPanel`,
  and `viewport/ThreeSimulationViewport` (the live Three.js mount;
  see Layer 9 below).
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
  Bridges are allowed to read engine state and emit engine events but
  **must not** mutate renderer state and must use entity command APIs
  (e.g. `VehicleEntity.setCommand`) instead of touching internal fields.
- **Internal messages** (`messages/`) — JSON-friendly POJOs:
  `SimClockMessage`, `SimPose2DMessage`, `SimVehicleStateMessage`,
  `SimVehicleCommandMessage`. They are deliberately NOT ROS2 messages;
  ROS2 maps to them through adapters.
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
  - `VehicleCommandTopicBridge` subscribes to a command topic and calls
    `vehicle.setCommand(...)` on the matching entity. Adapter errors
    and unknown vehicles are logged through `engine.logger` and dropped
    silently.
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

### Why this is transport-agnostic

The simulator only ever depends on **interfaces**, never on a
particular wire. Concretely:

- Swapping WebSocket for ROS2 is implementing one new `Transport` and
  zero changes to bridges / adapters / engine.
- ROS2 message types (`nav_msgs/Odometry`, `geometry_msgs/Twist`,
  `rosgraph_msgs/Clock`) never appear in `src/simulation`; a future
  `Ros2OdometryAdapter` lives in `src/infrastructure/communication/ros2/`
  and converts to/from `SimVehicleStateMessage`.
- The engine's `dt` is the only timing primitive `PeriodicPublisher`
  uses — replay, headless tests, and fast-forward all "just work".

### How a future ROS2 integration plugs in

1. **Quickest path — rosbridge.** Implement a `RosbridgeTransport` (or
   reuse `WebSocketTransport`) and write JSON↔ROS message adapters
   under `src/infrastructure/communication/rosbridge/`. No engine
   changes.
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
  'ego',
  Topics.egoCommand.name,
  engine,
  new JsonVehicleCommandAdapter(),
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

The current ship is a Three.js renderer at
`src/ui/renderers/three/`. Future renderers (Phaser, Pixi, Canvas 2D,
WebGPU) follow the same shape and live as siblings under
`src/ui/renderers/`.

### Three.js renderer — modules

- **`viewport/ThreeSimulationViewport.tsx`** — the React mount. Owns
  the container `<div>`, instantiates `ThreeSimulationRenderer`, calls
  `init(state)` once, forwards engine events (`tick`, `reset`,
  `scenarioLoaded`, `entityAdded`, `entityRemoved`, `collision`) and
  `window.resize` / `ResizeObserver` to the renderer, and disposes on
  unmount. Contains zero Three.js imports and zero simulation logic.
- **`renderers/three/core/ThreeSimulationRenderer.ts`** — top-level
  Three.js coordinator. Implements `SimulationRenderer`. Creates the
  `THREE.Scene`, camera, `WebGLRenderer`, lights, and every
  sub-renderer; orchestrates them in `init` / `render` / `dispose`.
  Exposes `resize()`, `clearTrails()`, `setCameraMode(mode)`.
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
sim.x → three.x
sim.y → three.z
sim.z → three.y
yaw   → rotation.y = -yaw     (vehicle mesh local forward = +X)
```

The yaw inversion comes from Three.js's positive `rotation.y` rotating
+X → −Z; we want sim yaw=π/2 (forward = sim+Y = three+Z) to land mesh
forward on +Z, so we negate. The derivation lives at the top of
`simToThree.ts`; renderers must never re-derive it inline.

### Object sub-renderers (`renderers/three/objects/`)

Each sub-renderer is responsible for **one entity type** (or one
piece of static scenery) and has the same lifecycle:
`sync(state)` → upsert objects, drop stale ones; `dispose()` →
remove + GPU-dispose everything. None of them touch entity internals
beyond the public read API.

- **`ThreeGroundRenderer`** — static ground plane (40×40 m) plus a
  1 m grid. Created once, never reads `SimulationState`.
- **`ThreeAxesRenderer`** — `THREE.AxesHelper` placed at the origin
  to ground users in the engine frame.
- **`ThreeVehicleRenderer`** — one `BoxGeometry` per vehicle, mesh
  long axis along sim +X (matching the yaw convention). Repositions
  via `simPoint2DToThree`; rotates via `simYawToThreeRotationY`.
- **`ThreeStaticObstacleRenderer`** — cylinders for static obstacles.
- **`ThreeDynamicActorRenderer`** — spheres for dynamic actors.
- **`ThreeTrailRenderer`** — visual breadcrumb trail per vehicle.
  Trail points live **only** here (never on the entity); a per-id
  sliding window is rebuilt into a `THREE.Line` each tick. `clear()`
  is invoked from the viewport on `reset` / `scenarioLoaded`.
- **`ThreePathRenderer`** — placeholder for displayed paths (e.g.
  from a Python planner over the upcoming communication layer).
  Exposes `setPath(id, points)` / `removePath(id)`; `sync` is a
  no-op until a `PathEntity` or `SimPathMessage` exists.

### Debug layer (`renderers/three/debug/`)

- **`ThreeDebugLayer`** — fans out `sync` to per-flag debug
  renderers; `setOptions` toggles them at runtime.
- **`BoundingCircleRenderer`** — thin ring at each entity's
  bounding-circle radius. Picks up any entity that exposes
  `radius` and either `position` or `pose.position`.
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
- **`TopDownCameraController`** — fixed top-down minimap view. Sets
  `camera.up = (0, 0, -1)` so screen-up corresponds to sim +Y.
- **`OrbitCameraController`** — interactive 3/4 view using Three.js's
  built-in `OrbitControls` (left-drag rotates, wheel zooms, right-drag
  pans). No `@react-three/drei` / fiber dependency — everything goes
  through the existing `three` package. The controller forwards
  `OrbitControls`'s `change` event to `context.requestRender()` so
  drags / zooms repaint the canvas even while the engine is paused.
  Damping is intentionally off so each input event maps to exactly
  one render.
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
  `trailLength`, `cameraMode`, `projection`, `orthoFrustumHeight`.
  The renderer reads it once on construction; flags can be flipped
  later via dedicated setters. Single-renderer flags belong on the
  renderer itself, not in this shared struct — add to it only when
  ≥ 2 sub-renderers care. `orthoFrustumHeight` is the world-space
  vertical extent of the orthographic frustum (m); horizontal
  extent follows the canvas aspect on every `resize()`.

### What renderers must never do

- Mutate `SimulationState`, entity fields, or fire engine events.
- Compute physics, collisions, or scenario logic.
- Schedule the simulation (the engine owns the tick — the viewport
  only invokes `render(state)` in response to engine events and DOM
  resize).
- Duplicate the sim ↔ three coordinate or yaw mapping. Always go
  through `mapping/simToThree.ts`.

### Adding a new renderer (Phaser, Pixi, Canvas 2D, WebGPU)

1. Create `src/ui/renderers/<name>/` with the same internal split
   (`core/`, `mapping/`, `objects/`, `cameras/`, `config/`,
   optionally `debug/`).
2. Implement `SimulationRenderer` in
   `src/ui/renderers/<name>/core/<Name>SimulationRenderer.ts`.
3. Add `src/ui/viewport/<Name>SimulationViewport.tsx`.
4. Swap (or feature-flag) the viewport import in `App.tsx`.

Every existing renderer-agnostic invariant (mapping in one place,
sub-renderers per entity type, registry-based lifecycle, full GPU
disposal) carries over verbatim.

## Tick pipeline (control flow)

```
SimulationLoop  ──tick(dt)──▶  SimulationEngine.tick
                                 │
                                 ├─ clock.tick(dt)
                                 ├─ systems.update(dt, state)
                                 │     ├─ VehicleDynamicsSystem  → entity.update(dt, state)
                                 │     ├─ CollisionSystem        → emits 'collision'
                                 │     ├─ MetricsSystem
                                 │     ├─ ScenarioSystem         → applies scheduled events
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
                                            └──▶ ThreeSimulationViewport
                                                        │
                                                        ▼
                                          renderer.render(engine.state)
                                                        │
                                                        ├─ sub-renderers .sync(state)
                                                        ├─ camera controller .update(state)
                                                        └─ WebGLRenderer.render(scene, camera)

  External world  ──Transport.subscribe──▶  TopicBridge
                                              │
                                              └─ adapter.toInternal()
                                                       │
                                                       ▼
                                               vehicle.setCommand(...)
```

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
- **New external schema** — implement `MessageAdapter<TWire, TSim>`
  under `src/infrastructure/communication/<wire>/` (or a dedicated
  integration package). Engine code does not change.
- **New bridge** — implement `TopicBridge` under
  `src/simulation/communication/bridges/`. Wire it through
  `start()`/`stop()` from your provider; if it's a publisher, drive
  it with a `PeriodicPublisher` inside `CommunicationSystem`.

## Tests (vitest)

- `src/math/geometry/operations2D.test.ts` — vector ops (12 tests)
- `src/simulation/core/SimulationClock.test.ts` — clock (7 tests)
- `src/simulation/entities/VehicleEntity.test.ts` — kinematic update,
  including semi-implicit step verification (6 tests)
- `src/simulation/scenarios/ScenarioLoader.test.ts` — parse +
  `buildEntity` + `loadFromUrl` with injected `fetch` (12 tests)
- `src/simulation/communication/PeriodicPublisher.test.ts` — period
  enforcement, dt validation, reset, async-callback detachment
  (6 tests)
- `src/simulation/communication/adapters/JsonVehicleCommandAdapter.test.ts`
  — round-trip + strict validation of malformed messages (5 tests)
- `src/simulation/communication/bridges/VehicleCommandTopicBridge.test.ts`
  — applies command via `setCommand`, ignores foreign `vehicleId`,
  drops malformed messages, `stop()` unsubscribes (5 tests)
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
- `src/ui/renderers/three/mapping/simToThree.test.ts` — sim ↔ three
  point/vector mapping + yaw inversion + round-trip through
  `threeToSim` (8 tests)
- `src/ui/renderers/three/core/ThreeRenderObjectRegistry.test.ts` —
  set / get / iteration order / delete / clear (3 tests)
- `src/ui/renderers/three/core/threeDisposal.test.ts` — geometry +
  single material + multi-material + nested children + texture-map
  disposal (5 tests)

WebGL-bound renderer code (lights, `WebGLRenderer`, full `init`) is
intentionally not unit-tested under vitest's `node` environment —
those paths are exercised in the running app. Headless WebGL would
require `jsdom` + a software GL backend, which is overkill for this
project right now.
