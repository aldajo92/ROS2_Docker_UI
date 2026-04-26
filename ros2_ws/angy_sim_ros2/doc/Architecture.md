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
    events/           Typed event bus + SimulationEvents map
    logging/          Pluggable level-filtered logger
    render/           SimulationRenderer interface (no impl)
    communication/    Transport-agnostic comms contracts + bridges
      messages/         Internal JSON-friendly message types
      adapters/         JSON adapters (validation + pass-through)
      bridges/          TopicBridge implementations
    collision/        Backend-agnostic 2D collision contracts
  infrastructure/
    communication/    Concrete Transports (mock, in-memory, WebSocket)
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
    CollisionSystem           ← detects contacts on the integrated state
    MetricsSystem             ← observes the final state
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
  `SimulationState`. Today every entity maps to a circle (vehicle,
  static obstacle, dynamic actor); switching a vehicle to an
  oriented box is a one-file change here, not a backend change.
- **`SimpleCircleCollisionBackend2D`** — default backend. O(n²)
  circle-vs-circle, returns penetration depth and a unit normal.
  Silently ignores oriented boxes; if you need them, switch
  backends.
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
- **`SimulationProvider.tsx`** — builds the engine **once**, creates
  the shared `VehicleCommandQueue`, registers the default system
  pipeline (`ScenarioSystem` → `VehicleCommandSystem` →
  `VehicleDynamicsSystem` → `CollisionSystem` → `MetricsSystem`,
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
  unmount. Does not import Three.js directly — it only imports the
  renderer adapter class — and contains zero simulation logic.
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
  `setCommand`'s sticky semantics. Cleans up listeners and the tick
  subscription on unmount.
- **`SimulatorKeyboardControls`** — headless component (`return
  null`) that hosts the hook for the default `"ego"` vehicle.
  Mounted inside `<SimulationProvider>` in `App.tsx`.

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
  `buildEntity` + `loadFromUrl` with injected `fetch` (12 tests)
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
