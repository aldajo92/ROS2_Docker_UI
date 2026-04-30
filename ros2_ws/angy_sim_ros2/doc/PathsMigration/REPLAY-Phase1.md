## Prompt 1: formato de replay + recorder + sistema de grabación + tests

````text
I want to implement Phase 1 of simulation recording/replay support in `angy_sim_ros2`.

Context:
- Follow `Architecture.md` and `Development_Guide.md`.
- The simulation core is rendering-agnostic and transport-agnostic.
- `src/simulation` and `src/math` must not import React, Three.js, Phaser, DOM APIs, WebSocket APIs, ROS2, DDS, Rapier, or infrastructure code.
- Renderers must remain read-only consumers of `SimulationState`.
- Vehicle commands must still go through `VehicleCommandQueue`.
- Collision detection must still go through `CollisionSystem -> CollisionBackend2D`.
- Trajectories are simulation-owned via `TrajectoryRegistry` and `TrajectoryTrackingSystem`.
- This is Phase 1 of the recording/replay migration. UI work and replay playback are deferred.

Phase 1 goal:
Build the simulation-side foundation for recording. After this phase the engine can capture per-tick snapshots into an in-memory recorder and export them as a JSON replay object. No UI, no file download, no replay playback yet.

Important design decisions:
- Do not make entities write files.
- Do not make renderers record simulation data.
- Do not store recording data inside `VehicleEntity`.
- Do not use CSV; use JSON.
- Do not import DOM APIs in `src/simulation`.
- Replay playback (load, scrub, timeline) is **not** part of this phase.
- File download/upload helpers (Blob, anchor click, `<input type="file">`) are **not** part of this phase.

Expected architecture after Phase 1:

```text
SimulationState
  -> tick/time/entities (read-only inputs to snapshot)

createSnapshotFromState(state)
  -> SimulationFrameSnapshot

SimulationRecorder
  -> owns SimulationFrameSnapshot[]
  -> start/stop/clear/append/export

SimulationRecorderSystem
  -> implements SimulationSystem
  -> on each tick (when recording enabled), calls
     createSnapshotFromState and appends to recorder

SimulationEngine / SimulationController
  -> exposes safe recording APIs
  -> registers SimulationRecorderSystem in the system pipeline
```

Files to create:

```text
src/simulation/recording/ReplayFormat.ts
src/simulation/recording/SimulationFrameSnapshot.ts
src/simulation/recording/createSnapshotFromState.ts
src/simulation/recording/SimulationRecorder.ts
src/simulation/recording/SimulationRecorderSystem.ts
```

Files to update:

```text
src/simulation/core/SimulationEngine.ts
src/simulation/core/SimulationController.ts
src/simulation/events/SimulationEvents.ts (only if events are added)
src/app/SimulationProvider.tsx (system registration order, no UI changes)
```

Architecture rules:
- `src/simulation/recording/**` must not import React, Three.js, Phaser, DOM APIs, WebSocket APIs, ROS2, DDS, Rapier, or `src/infrastructure`.
- The recorder/system never mutate entities.
- The recorder/system never read renderer state.
- Snapshots must be JSON-friendly (plain objects, no class instances, no functions, no circular references, no Maps/Sets).

1. Define the replay file format

Create `src/simulation/recording/ReplayFormat.ts`:

```ts
import type { SimulationFrameSnapshot } from "./SimulationFrameSnapshot";

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

export const REPLAY_FORMAT_TAG = "angy_sim_replay" as const;
export const REPLAY_FORMAT_VERSION = 1 as const;
```

Rules:

* Keep the format JSON-serializable.
* Do not introduce class instances or functions in this type.
* Do not depend on DOM/Node types.

2. Define the per-frame snapshot

Create `src/simulation/recording/SimulationFrameSnapshot.ts`:

```ts
export type BaseEntitySnapshot = {
  id: string;
  kind: string;
};

export type VehicleEntitySnapshot = BaseEntitySnapshot & {
  kind: "vehicle";
  pose: { x: number; y: number; yaw: number };
  velocity?: { v?: number; w?: number };
  radius?: number;
};

export type StaticObstacleEntitySnapshot = BaseEntitySnapshot & {
  kind: "static_obstacle";
  position: { x: number; y: number };
  radius?: number;
};

export type DynamicActorEntitySnapshot = BaseEntitySnapshot & {
  kind: "dynamic_actor";
  pose?: { x: number; y: number; yaw?: number };
  position?: { x: number; y: number };
  velocity?: { vx?: number; vy?: number; w?: number };
  radius?: number;
};

export type GenericEntitySnapshot = BaseEntitySnapshot & {
  kind: string;
  data?: Record<string, unknown>;
};

export type EntitySnapshot =
  | VehicleEntitySnapshot
  | StaticObstacleEntitySnapshot
  | DynamicActorEntitySnapshot
  | GenericEntitySnapshot;

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

* All fields must be plain JSON-friendly values.
* Do not reuse class instances from `src/simulation/entities`.
* The discriminator is the `kind` field.
* `GenericEntitySnapshot` is the catch-all for entity types not yet supported.

3. Implement `createSnapshotFromState`

Create `src/simulation/recording/createSnapshotFromState.ts`:

```ts
import type { SimulationState } from "../core/SimulationState";
import type {
  EntitySnapshot,
  SimulationFrameSnapshot,
} from "./SimulationFrameSnapshot";

export function createSnapshotFromState(
  state: SimulationState,
): SimulationFrameSnapshot {
  // 1. Read tick + time from state.clock (public APIs only).
  // 2. Iterate state.entities.toArray().
  // 3. Map each supported entity to a JSON snapshot:
  //    - VehicleEntity   -> VehicleEntitySnapshot   (pose + velocity + radius)
  //    - StaticObstacleEntity -> StaticObstacleEntitySnapshot (position + radius)
  //    - DynamicActorEntity   -> DynamicActorEntitySnapshot   (pose/position + velocity)
  //    - other            -> GenericEntitySnapshot { id, kind, data?: undefined }
  // 4. Optionally include metrics if a MetricsSystem-like API is reachable
  //    via state. If not, leave metrics undefined.
  // 5. Optionally include events if state already exposes a per-tick event
  //    buffer. If not, leave events undefined.
  // 6. Return a fresh plain object — no class instances, no shared references
  //    to mutable simulation data.
}
```

Rules:

* Use only public entity APIs.
* Do not mutate state.
* Do not import renderer code.
* Do not import UI code.
* Round-trip safety: `JSON.parse(JSON.stringify(snapshot))` must equal the original.
* If an entity type is unsupported, fall back to `GenericEntitySnapshot` with a documented policy comment.

4. Implement `SimulationRecorder`

Create `src/simulation/recording/SimulationRecorder.ts`:

```ts
import type { ReplayFileFormat } from "./ReplayFormat";
import type { SimulationFrameSnapshot } from "./SimulationFrameSnapshot";

export type SimulationRecorderConfig = {
  enabled: boolean;
  maxFrames: number;
  sampleEveryNTicks: number;
};

export const DEFAULT_SIMULATION_RECORDER_CONFIG: SimulationRecorderConfig = {
  enabled: false,
  maxFrames: 20000,
  sampleEveryNTicks: 1,
};

export type SimulationRecorderStatus = {
  enabled: boolean;
  recording: boolean;
  frameCount: number;
  maxFramesReached: boolean;
};

export class SimulationRecorder {
  constructor(config?: Partial<SimulationRecorderConfig>);

  setConfig(config: Partial<SimulationRecorderConfig>): void;
  getConfig(): SimulationRecorderConfig;

  start(): void;
  stop(): void;
  clear(): void;

  isRecording(): boolean;
  getStatus(): SimulationRecorderStatus;

  /** Append a snapshot. No-op when not recording. Stops recording
   *  automatically once `maxFrames` is reached. */
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

Rules:

* `start()` flips an internal recording flag to true.
* `stop()` flips it to false; existing frames are preserved.
* `clear()` empties the frame buffer regardless of recording state.
* `append()` is a no-op when not recording.
* When `frames.length >= maxFrames`, `append()` stops recording and sets a `maxFramesReached` flag exposed via `getStatus()`. Do not silently drop frames.
* `getFrames()` returns a `readonly` view; callers must not mutate it.
* `toReplayFile()` returns a fresh, JSON-serializable `ReplayFileFormat` with a defensive copy of the frames array.
* No DOM APIs. No `Blob`, no `URL`, no `document`.

5. Implement `SimulationRecorderSystem`

Create `src/simulation/recording/SimulationRecorderSystem.ts`:

```ts
import type { SimulationState } from "../core/SimulationState";
import type { SimulationSystem } from "../systems/SimulationSystem";
import { createSnapshotFromState } from "./createSnapshotFromState";
import type { SimulationRecorder } from "./SimulationRecorder";

export class SimulationRecorderSystem implements SimulationSystem {
  constructor(private readonly recorder: SimulationRecorder);

  /** Counts engine ticks (NOT sim seconds) to honor sampleEveryNTicks. */
  reset(): void;

  update(state: SimulationState, dtSec: number): void;
}
```

Recommended system order in `SimulationProvider.tsx`:

```text
ScenarioSystem
VehicleCommandSystem
VehicleDynamicsSystem
TrajectoryTrackingSystem (if registered)
CollisionSystem
MetricsSystem
SimulationRecorderSystem
CommunicationSystem (optional, may run before or after)
```

Rules:

* Implements `SimulationSystem`.
* Reads `recorder.getConfig()` each tick to honor live config edits.
* Skips work entirely if `recorder.isRecording() === false` or `enabled === false`.
* Honors `sampleEveryNTicks` by counting `update` invocations modulo `N`.
* Calls `createSnapshotFromState(state)` and `recorder.append(frame)`.
* Never mutates state.
* No DOM. No wall-clock time.
* `reset()` is invoked on engine reset and resets the internal tick counter.

6. Engine / controller wiring

Update `SimulationEngine.ts` and `SimulationController.ts` to expose a small, safe surface:

```ts
// SimulationEngine
recorder: SimulationRecorder            // composition, not inheritance
startRecording(): void
stopRecording(): void
clearRecording(): void
isRecording(): boolean
getRecordingStatus(): SimulationRecorderStatus
exportRecording(metadata?: { scenarioName?: string; scenarioDescription?: string; metadata?: Record<string, unknown> }): ReplayFileFormat

// SimulationController (delegates to engine)
startRecording(): void
stopRecording(): void
clearRecording(): void
isRecording(): boolean
getRecordingStatus(): SimulationRecorderStatus
getRecordingFrameCount(): number
setRecordingConfig(config: Partial<SimulationRecorderConfig>): void
getRecordingConfig(): SimulationRecorderConfig
exportRecording(): ReplayFileFormat
```

Rules:

* The engine owns one `SimulationRecorder` instance.
* The engine registers exactly one `SimulationRecorderSystem` referencing that recorder.
* `engine.reset()` should clear the recorder (so a fresh run starts clean) — make this an explicit, documented behavior.
* `engine.loadScenario()` should also clear the recorder (the previous scenario's frames belong to that scenario, not this one).
* `exportRecording()` reads `engine.fixedDtSec` (or the analogous public field) to populate `ReplayFileFormat.fixedDtSec`. If no such field exists, expose one or accept it via the optional metadata argument.
* UI must call these APIs; UI must never poke `recorder.append`, `recorder.getFrames`, or internal arrays.

7. Optional events

Add events only if the existing event bus already has a clean place for them. Keep this minimal in Phase 1:

```text
recordingStarted
recordingStopped
recordingCleared
recordingFrameAppended  (optional, may be noisy)
recordingMaxFramesReached
```

Do not introduce a parallel event system. If `TypedEventBus<SimulationEvents>` already exists, extend its event map; otherwise skip events for now.

8. Tests

Add tests under `src/simulation/recording/`:

`createSnapshotFromState.test.ts`:

* captures vehicle pose, velocity, radius
* captures static obstacles
* captures dynamic actors (pose or position depending on entity API)
* includes correct `tick` and `timeSec`
* falls back to `GenericEntitySnapshot` for unsupported types
* does not mutate state (compare deep snapshot before/after)
* round-trips through `JSON.parse(JSON.stringify(...))`

`SimulationRecorder.test.ts`:

* default config is recording-disabled
* `start()` toggles `isRecording()` true
* `stop()` toggles `isRecording()` false; existing frames are kept
* `append()` while not recording is a no-op
* `append()` while recording grows the frame buffer
* `clear()` empties frames regardless of recording state
* `maxFrames` policy: once reached, recording stops and `getStatus().maxFramesReached === true`
* `sampleEveryNTicks` is **not** the recorder's responsibility (the system handles cadence) — verify the recorder appends every call
* `toReplayFile()` produces a valid `ReplayFileFormat` with `format === "angy_sim_replay"`, `version === 1`, the requested `fixedDtSec`, and a defensive copy of frames

`SimulationRecorderSystem.test.ts`:

* records frames when recorder enabled + recording
* does not record when disabled
* does not record when `enabled` but not started
* respects `sampleEveryNTicks` (e.g. with N=2 → 1 frame per 2 ticks)
* runs after dynamics/collision/metrics — verify by spying on system order in a small fixture engine
* survives engine `reset()` cleanly (counter reset, recorder cleared if engine policy says so)
* never mutates entities or trajectories

Architecture tests:

* `src/simulation/recording/**` does not import React, Three.js, Phaser, DOM, WebSocket, ROS2, DDS, Rapier, or `src/infrastructure`. (A simple `rg` over imports is fine if there is no automated arch-fitness test infra; otherwise add a unit test that scans the recording folder.)

9. Documentation updates (Phase 1 portion)

Update `Architecture.md` with a short new layer section:

```text
Layer: recording/replay (Phase 1 - foundation)

Recording is simulation-owned. SimulationRecorder lives in
src/simulation/recording. SimulationRecorderSystem samples the final
state of each tick (after dynamics, trajectory tracking, collision,
metrics) and appends a JSON-friendly SimulationFrameSnapshot. The UI
will, in a later phase, download the exported ReplayFileFormat. UI and
playback are deferred to Phases 2 and 3.

Renderers do not record source-of-truth data.
Entities do not write replay files.
```

Update `Development_Guide.md` with the rules:

* entities do not write replay files
* renderers do not record source-of-truth data
* DOM file download/upload lives in UI only (Phases 2 and 3)
* recording config is mutated only via `SimulationController`
* `src/simulation/recording` must not import `src/infrastructure`, DOM, Three, Phaser, React, ROS2, DDS, WebSocket, or Rapier

10. Expected result after Phase 1

* The simulation has an in-memory recorder driven by a `SimulationSystem`.
* The recorder produces a JSON-serializable replay object on demand via `engine.exportRecording()`.
* No UI exists yet for start/stop/download; that is Phase 2.
* No replay playback exists yet; that is Phase 3.
* The architecture invariants are preserved.
* All new code is covered by unit tests (snapshot, recorder, recorder system, architecture imports).
* The full test suite still passes; `npm run build` still passes.
````
