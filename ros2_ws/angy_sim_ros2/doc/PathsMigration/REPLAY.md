Sí, es una buena idea, pero lo separaría como una feature grande llamada **recording/replay** o **simulation playback**.

No usaría CSV como formato principal. CSV sirve para exportar trayectorias o telemetría simple, pero para reproducir una simulación necesitas más estructura:

```text
scenario metadata
fixedDtSec
ticks
entities por tick
commands aplicados
events
paths/trajectories opcionalmente
version del formato
```

Para eso es mejor usar **JSON** o **JSONL**.

Mi recomendación:

```text
Formato principal: JSONL comprimible o JSON estructurado
Export opcional: CSV para análisis externo
```

## Por qué no CSV como formato principal

CSV se queda corto cuando tienes:

```text
- múltiples entidades
- tipos diferentes de entidad
- eventos
- comandos
- cambios de estado por tick
- metadata del scenario
- paths
- colisiones
- timestamps
```

Podrías hacer un CSV largo tipo:

```text
tick,time,entityId,entityKind,x,y,yaw,v,w
```

pero en cuanto quieras guardar eventos, comandos, colisiones o diferentes entidades, se vuelve incómodo.

## Mejor formato

Yo usaría un formato tipo:

```json
{
  "format": "angy_sim_replay",
  "version": 1,
  "scenarioName": "simple-scenario",
  "fixedDtSec": 0.0166666667,
  "frames": [
    {
      "tick": 1,
      "timeSec": 0.016,
      "entities": [
        {
          "id": "ego",
          "kind": "vehicle",
          "pose": { "x": 0.01, "y": 0, "yaw": 0.003 },
          "velocity": { "v": 0.5, "w": 0.2 }
        }
      ],
      "events": []
    }
  ]
}
```

O JSONL para archivos más grandes:

```json
{"type":"metadata","version":1,"scenarioName":"simple-scenario","fixedDtSec":0.0166667}
{"type":"frame","tick":1,"timeSec":0.016,"entities":[...],"events":[]}
{"type":"frame","tick":2,"timeSec":0.033,"entities":[...],"events":[]}
```

Para tu caso, empezaría con **JSON estructurado** porque es más fácil de implementar y descargar en frontend. Más adelante puedes pasar a JSONL o compresión.

## Cómo encaja en tu arquitectura

No haría que cada entidad “guarde a archivo” directamente. Las entidades no deberían saber de archivos ni descargas.

La forma correcta sería:

```text
SimulationRecorderSystem
  -> observa SimulationState cada tick
  -> guarda snapshots en memoria

ReplayExporter
  -> convierte recording a JSON Blob descargable

ReplayLoader
  -> carga JSON
  -> crea ReplaySession

ReplayPlayer
  -> reproduce frames por tick/timeline

Timeline UI
  -> controla frame actual / play / pause / seek
```

Esto respeta tu regla de que los sistemas mutan u observan durante el tick, y que UI/renderers no deben volverse fuente de verdad del estado de simulación. También mantiene `src/simulation` libre de DOM, React y APIs de descarga, como define tu Development Guide. 

---

# Prompt completo

````text
I want to add simulation recording and replay support to `angy_sim_ros2`.

Context:
- Follow `Architecture.md` and `Development_Guide.md`.
- The simulation core is rendering-agnostic and transport-agnostic.
- `src/simulation` and `src/math` must not import React, Three.js, Phaser, DOM APIs, WebSocket APIs, ROS2, DDS, Rapier, or infrastructure code.
- Renderers must remain read-only consumers of `SimulationState`.
- Vehicle commands must still go through `VehicleCommandQueue`.
- Collision detection must still go through `CollisionSystem -> CollisionBackend2D`.
- Trajectories are simulation-owned if the trajectory tracking migration has already been implemented.
- I want to record what happens during a simulation run and replay it later.

Goal:
Add a recording/replay feature.

User story:
- In the UI/Inspector, I can enable recording.
- While recording is enabled, the simulator stores snapshots of the simulation over time.
- I can stop recording and download a file.
- Later, I can open/import that file.
- The app should enter replay mode.
- In replay mode, the renderer shows the recorded simulation state.
- A timeline appears below the renderer.
- The timeline allows play, pause, seek, and scrub by tick/time.
- Replay should not require running the original simulation systems.

Important design decisions:
- Do not make entities write files.
- Do not make renderers record simulation data.
- Do not store recording data inside `VehicleEntity`.
- Do not use CSV as the primary replay format.
- Use a structured JSON replay format for the first implementation.
- CSV export may be added later for telemetry analysis, but replay should use JSON.
- The replay file should contain enough information to reconstruct visual playback.

Recommended format:
Use JSON for the first version.

Example replay file:

```json
{
  "format": "angy_sim_replay",
  "version": 1,
  "scenarioName": "simple-scenario",
  "createdAt": "2026-04-28T00:00:00.000Z",
  "fixedDtSec": 0.0166666667,
  "frames": [
    {
      "tick": 1,
      "timeSec": 0.0166666667,
      "entities": [
        {
          "id": "ego",
          "kind": "vehicle",
          "pose": { "x": 0.01, "y": 0.0, "yaw": 0.003 },
          "velocity": { "v": 0.5, "w": 0.2 },
          "radius": 0.4
        }
      ],
      "events": []
    }
  ]
}
````

Do not use JSONL yet unless needed. Keep the first implementation simple.

Create a new simulation module:

src/simulation/recording/
ReplayFormat.ts
SimulationFrameSnapshot.ts
SimulationRecorder.ts
SimulationRecorderSystem.ts
ReplaySession.ts
ReplayPlayer.ts
createSnapshotFromState.ts
applyReplayFrameToState.ts or createReplayStateFromFrame.ts

UI/runtime helpers may live outside simulation:

src/ui/replay/
ReplayFileDownloader.ts
ReplayFileLoader.ts
ReplayTimeline.tsx
ReplayControlsPanel.tsx

or place UI components wherever the current UI structure expects them.

1. Define replay format types

Create:

src/simulation/recording/ReplayFormat.ts

```ts
export type ReplayFileFormat = {
  format: "angy_sim_replay";
  version: 1;
  scenarioName?: string;
  scenarioDescription?: string;
  createdAt?: string;
  fixedDtSec: number;
  metadata?: Record<string, unknown>;
  frames: SimulationFrameSnapshot[];
};
```

Create:

src/simulation/recording/SimulationFrameSnapshot.ts

```ts
export type EntitySnapshot =
  | VehicleEntitySnapshot
  | StaticObstacleEntitySnapshot
  | DynamicActorEntitySnapshot
  | GenericEntitySnapshot;

export type BaseEntitySnapshot = {
  id: string;
  kind: string;
};

export type VehicleEntitySnapshot = BaseEntitySnapshot & {
  kind: "vehicle";
  pose: {
    x: number;
    y: number;
    yaw: number;
  };
  velocity?: {
    v?: number;
    w?: number;
  };
  radius?: number;
};

export type StaticObstacleEntitySnapshot = BaseEntitySnapshot & {
  kind: "static_obstacle";
  position: {
    x: number;
    y: number;
  };
  radius?: number;
};

export type DynamicActorEntitySnapshot = BaseEntitySnapshot & {
  kind: "dynamic_actor";
  pose?: {
    x: number;
    y: number;
    yaw?: number;
  };
  position?: {
    x: number;
    y: number;
  };
  velocity?: {
    vx?: number;
    vy?: number;
    w?: number;
  };
  radius?: number;
};

export type GenericEntitySnapshot = BaseEntitySnapshot & {
  kind: string;
  data?: Record<string, unknown>;
};

export type ReplayEventSnapshot = {
  type: string;
  payload?: Record<string, unknown>;
};

export type SimulationFrameSnapshot = {
  tick: number;
  timeSec: number;
  entities: EntitySnapshot[];
  events?: ReplayEventSnapshot[];
  metrics?: {
    totalDistance?: number;
    peakSpeed?: number;
    collisionCount?: number;
  };
};
```

Rules:

* Keep all types JSON-friendly.
* Do not include class instances.
* Do not include Three.js, Phaser, DOM, Rapier, ROS2, or WebSocket types.
* Do not include functions.
* Do not include circular references.

2. Create snapshot function

Create:

src/simulation/recording/createSnapshotFromState.ts

Function:

```ts
export function createSnapshotFromState(
  state: SimulationState
): SimulationFrameSnapshot
```

Responsibilities:

* Read current tick/time from state.
* Read all entities from `state.entities.toArray()`.
* Convert each supported entity into a JSON-friendly snapshot.
* Include metrics if useful.
* Do not mutate state.
* Do not import renderer code.
* Do not import UI code.

Supported first:

* vehicle
* static_obstacle
* dynamic_actor

If an entity type is unsupported:

* create a generic snapshot if possible
* or skip it with a documented policy

3. Create SimulationRecorder

Create:

src/simulation/recording/SimulationRecorder.ts

Responsibilities:

* Own an array of `SimulationFrameSnapshot`.
* Start/stop recording.
* Clear recording.
* Append frames.
* Enforce optional limits.
* Export replay object.

Suggested API:

```ts
export type SimulationRecorderConfig = {
  enabled: boolean;
  maxFrames?: number;
  sampleEveryNTicks?: number;
};

export class SimulationRecorder {
  constructor(config?: Partial<SimulationRecorderConfig>);

  setConfig(config: Partial<SimulationRecorderConfig>): void;
  getConfig(): SimulationRecorderConfig;

  start(): void;
  stop(): void;
  clear(): void;

  isRecording(): boolean;

  append(frame: SimulationFrameSnapshot): void;

  getFrames(): readonly SimulationFrameSnapshot[];

  toReplayFile(params: {
    scenarioName?: string;
    scenarioDescription?: string;
    fixedDtSec: number;
    metadata?: Record<string, unknown>;
  }): ReplayFileFormat;
}
```

Default config:

```ts
{
  enabled: false,
  maxFrames: 20000,
  sampleEveryNTicks: 1
}
```

Rules:

* `maxFrames` prevents runaway memory growth.
* `sampleEveryNTicks = 1` records every tick.
* If maxFrames is reached, choose a clear policy:

  * stop recording automatically, or
  * drop oldest frames
    For first implementation, prefer stopping automatically and exposing a warning flag if easy.

````

4. Create SimulationRecorderSystem

Create:

src/simulation/recording/SimulationRecorderSystem.ts

or:

src/simulation/systems/SimulationRecorderSystem.ts

Choose the location consistent with the project.

Responsibilities:
- Implements `SimulationSystem`.
- Runs after dynamics, trajectory tracking, collision, and metrics if possible.
- On each tick, if recording is enabled, create a snapshot and append it to recorder.
- Does not write files.
- Does not download files.
- Does not use DOM APIs.
- Does not use wall-clock time except optional metadata at export time.

Recommended system order:

```text
ScenarioSystem
VehicleCommandSystem
VehicleDynamicsSystem
TrajectoryTrackingSystem optional
CollisionSystem
MetricsSystem
SimulationRecorderSystem
CommunicationSystem optional
````

Reason:

* Recorder should capture the final state of the tick after dynamics/collision/metrics.
* Communication can run after or before recorder depending on whether outbound telemetry should be part of snapshot, but for now recorder only captures state.

5. Add controller/engine APIs

Add safe APIs to control recording.

In SimulationEngine or SimulationController, expose:

```ts
startRecording(): void;
stopRecording(): void;
clearRecording(): void;
isRecording(): boolean;
getRecordingFrameCount(): number;
exportRecording(): ReplayFileFormat;
```

If keeping recorder outside engine is cleaner, expose it through the composition root/context instead. But the UI should not mutate recorder internals directly.

Important:

* UI should call controller/recorder API.
* UI should not access internal arrays and mutate frames.
* Renderer should not know about recorder.

6. File download helper

Create UI-only helper:

src/ui/replay/ReplayFileDownloader.ts

Responsibilities:

* Convert `ReplayFileFormat` to JSON string.
* Create a Blob.
* Create a download URL.
* Trigger download.

This file may use DOM APIs because it lives in `src/ui`.

Do not put Blob/download code inside `src/simulation`.

Suggested filename:

```text
<scenarioName>-replay-<timestamp>.angy-replay.json
```

7. File load helper

Create:

src/ui/replay/ReplayFileLoader.ts

Responsibilities:

* Read selected file from `<input type="file">`.
* Parse JSON.
* Validate basic replay structure:

  * `format === "angy_sim_replay"`
  * `version === 1`
  * `frames` is an array
  * each frame has finite `tick` and `timeSec`
* Return `ReplayFileFormat`.

Do not put DOM File APIs inside `src/simulation`.

8. ReplaySession / ReplayPlayer

Create:

src/simulation/recording/ReplaySession.ts
src/simulation/recording/ReplayPlayer.ts

Responsibilities:

* Store loaded replay frames.
* Track current frame index.
* Support:

  * play
  * pause
  * seekToFrame(index)
  * seekToTime(timeSec)
  * stepForward
  * stepBackward
  * getCurrentFrame()
  * getDurationSec()
  * getFrameCount()
* Replay should be driven by UI or a replay loop.
* Replay should not run normal simulation systems.
* Replay is playback of recorded frames, not resimulation.

Suggested API:

```ts
export class ReplaySession {
  constructor(replay: ReplayFileFormat);

  getFrameCount(): number;
  getDurationSec(): number;
  getFrame(index: number): SimulationFrameSnapshot;
  getCurrentFrame(): SimulationFrameSnapshot;
  getCurrentIndex(): number;

  seekToFrame(index: number): void;
  seekToTime(timeSec: number): void;
  stepForward(): void;
  stepBackward(): void;
}
```

For `ReplayPlayer`, keep it simple:

* It can use a timer in UI layer if needed.
* Or keep pure logic in simulation and let React drive the playback.

Avoid mixing replay playback with `SimulationLoop` initially.

9. Rendering replay frames

Choose one approach.

Preferred first implementation:
Create a read-only replay state adapter that converts a `SimulationFrameSnapshot` into a renderable state-like object accepted by renderers.

Option A:
Create `createReplayStateFromFrame(frame)` that returns a minimal `SimulationState`-compatible object for renderers.

Option B:
Extend `SimulationRenderer` later to support `renderReplayFrame(frame)`.

Preferred for minimal changes:
Option A, if current renderers require `SimulationState`.

Rules:

* Replay render state is read-only.
* Do not mutate actual simulation state while scrubbing replay.
* Do not run normal systems during replay playback.
* Do not send replay commands to `VehicleCommandQueue`.

10. UI mode

Add app-level mode:

```ts
export type SimulationRunMode = "live" | "replay";
```

Behavior:

* Live mode:

  * normal simulation engine runs
  * start/pause/step/reset control the simulation
  * recording can be enabled

* Replay mode:

  * normal simulation engine is paused
  * timeline appears under the renderer
  * renderer shows replay frames
  * controls become replay controls:

    * play
    * pause
    * step forward
    * step backward
    * timeline scrub
    * exit replay

Do not mix live simulation ticks and replay playback.

11. Timeline UI

Add a timeline below the renderer when in replay mode.

Controls:

* play/pause
* current time
* duration
* frame index
* slider
* step forward/backward
* exit replay

Behavior:

* Moving the slider seeks to a frame.
* Renderer updates immediately.
* Playback advances through frames at recorded timing or fixed frame interval.
* First implementation can use frame index stepping rather than exact real-time playback.

12. Inspector/UI recording controls

Add controls:

Recording section:

* Enable recording checkbox or Start Recording button.
* Stop Recording button.
* Clear Recording button.
* Download Recording button.
* Frame count display.
* Sample every N ticks.
* Max frames.

Replay section:

* Load replay file button/input.
* Enter replay mode after successful load.
* Exit replay mode.

Validation:

* Cannot download if no frames.
* Cannot start recording in replay mode.
* Loading replay pauses live simulation.
* Starting live simulation exits replay mode or asks the user.

13. Scenario integration

Scenario JSON does not need to define recording by default.

Optional future feature:

* scenario may define recommended recording settings.
  Do not implement this unless explicitly needed.

14. Events

Add events only if needed:

* recordingStarted
* recordingStopped
* recordingCleared
* replayLoaded
* replayExited

Do not overcomplicate event model in first implementation.

15. Tests

Add tests for:

createSnapshotFromState:

* captures vehicle pose
* captures static obstacles
* captures dynamic actors
* includes tick/time
* does not mutate state

SimulationRecorder:

* starts/stops
* append only when recording or append behavior is well-defined
* maxFrames policy
* sampleEveryNTicks policy
* clear
* export format

SimulationRecorderSystem:

* records frames when enabled
* does not record when disabled
* samples after systems update based on registration order
* respects sampleEveryNTicks

ReplaySession:

* loads replay
* seekToFrame
* seekToTime
* stepForward/backward
* clamps bounds
* duration and frame count

Replay validation:

* rejects wrong format
* rejects unsupported version
* rejects malformed frames

Architecture tests:

* `src/simulation/recording` must not import React, Three.js, Phaser, DOM, WebSocket, ROS2, DDS, Rapier, infrastructure.
* UI file download helpers must not be imported from `src/simulation`.

16. Documentation updates

Update `Architecture.md` with a short Layer: recording/replay.

Explain:

* recording is simulation-owned snapshots
* `SimulationRecorderSystem` samples final tick state
* replay file is JSON
* replay mode does not run simulation systems
* timeline UI controls playback
* renderers visualize replay state but do not record data

Update `Development_Guide.md` with short rules:

* entities do not write replay files
* renderers do not record source-of-truth data
* DOM file download/upload lives in UI only
* replay playback must not mutate live simulation state

Expected result:

* I can enable recording from the Inspector.
* The simulator records frame snapshots while running.
* I can download a `.angy-replay.json` file.
* I can load that file later.
* The app enters replay mode.
* A timeline appears below the renderer.
* I can play, pause, seek, and scrub through recorded ticks.
* The live simulation engine is not running during replay mode.
* The architecture remains renderer-agnostic and deterministic.

````

## Recomendación práctica

Esta feature también la separaría en fases después:

```text
Phase 1: Replay format + recorder + snapshot tests
Phase 2: UI start/stop/download recording
Phase 3: load replay + timeline + playback mode
````

Pero el prompt anterior ya deja claro el diseño completo para que una AI no lo mezcle con renderer, entidades o scenario.
