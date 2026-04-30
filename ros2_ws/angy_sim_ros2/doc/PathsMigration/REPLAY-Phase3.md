## Prompt 3: cargar replay + timeline + modo de reproducción

````text
I want to implement Phase 3 of simulation recording/replay support in `angy_sim_ros2`.

Context:
- Phase 1 created the simulation-side foundation:
  - `ReplayFormat`, `SimulationFrameSnapshot`, `createSnapshotFromState`,
    `SimulationRecorder`, `SimulationRecorderSystem`.
  - Engine/controller APIs for start/stop/clear/export.
- Phase 2 added the UI for recording:
  - `src/ui/replay/ReplayFileDownloader.ts`
  - `src/ui/RecordingPanel.tsx`
  - App-level wiring + tests.
- The simulation core, renderers, and Inspector are decoupled per
  `Architecture.md` and `Development_Guide.md`.
- Trajectories are simulation-owned. Renderers are read-only consumers
  of `SimulationState`.
- Both phases' tests pass; the architecture invariants are intact.

Phase 3 goal:
Load a recorded replay file, enter a dedicated **replay mode**, and
let the user scrub the recording with a timeline. The live simulation
engine must not run during replay. Renderers visualize replay frames
through a read-only adapter; they receive no special replay code path.

Important design decisions:
- Replay is **playback of recorded frames**, not resimulation.
- Do not run normal simulation systems during replay.
- Do not send any commands into `VehicleCommandQueue` while replaying.
- Do not mutate live `SimulationState` while scrubbing replay.
- Do not put DOM `<input type="file">` parsing inside `src/simulation`.
- Renderers must keep working unchanged in replay mode. They only see a
  `SimulationState`-shaped object backed by a frame snapshot.
- Live mode and replay mode are mutually exclusive at the UI level.
- Keep the first implementation's playback driven by a UI timer
  (`requestAnimationFrame` or `setInterval`). Do **not** plug replay
  into `SimulationLoop`.

Expected architecture after Phase 3:

```text
ReplayFileFormat (JSON, from Phase 1 schema)
        |
        v
src/ui/replay/ReplayFileLoader.ts (DOM File -> JSON -> validated ReplayFileFormat)
        |
        v
src/simulation/recording/ReplaySession.ts
  - owns frames, current index
  - seek/step/play/pause primitives, frame-rate agnostic
        |
        v
src/simulation/recording/createReplayStateFromFrame.ts
  - returns a SimulationState-compatible read-only view
        |
        v
SimulationRenderer (Three or Phaser)
  - existing sync(state) path; no replay-specific branches

src/ui/replay/ReplayPlayer.ts (UI-side timer driver, optional)
  - wraps a ReplaySession with play/pause and a tick timer

src/ui/replay/ReplayTimeline.tsx
  - slider, play/pause, step, time display, exit replay

App.tsx
  - SimulationRunMode = "live" | "replay"
  - Recording panel disabled in replay mode
  - Live engine paused while in replay mode
  - Renderer subscribes to ReplaySession changes (instead of engine ticks)
    while in replay mode
```

Files to create:

```text
src/simulation/recording/ReplaySession.ts
src/simulation/recording/createReplayStateFromFrame.ts
src/ui/replay/ReplayFileLoader.ts
src/ui/replay/ReplayPlayer.ts                (optional UI-side timer)
src/ui/replay/ReplayTimeline.tsx
src/ui/replay/ReplayLoadButton.tsx           (or co-locate inside RecordingPanel)
```

Files to update:

```text
src/simulation/core/SimulationController.ts (add replay-mode hooks if any)
src/app/App.tsx
src/ui/viewport/SimulationViewportSwitcher.tsx
  (or whichever component dispatches state -> renderer.render(...) calls)
src/ui/RecordingPanel.tsx (disable while in replay mode via disabledReason)
```

Architecture rules:
- `src/simulation/recording/ReplaySession.ts` and
  `createReplayStateFromFrame.ts` must not import React, Three.js,
  Phaser, DOM, WebSocket, ROS2, DDS, Rapier, or `src/infrastructure`.
- `src/ui/replay/**` may use DOM APIs (`File`, `FileReader`, timers,
  React); it must not be imported from `src/simulation/**`.
- `createReplayStateFromFrame` is **read-only**. The returned view must
  surface the same public APIs renderers already use (`state.clock`,
  `state.entities`, `state.trajectories` if needed) but mutating it is
  undefined behavior — assertions or `Object.freeze` are encouraged.
- Live engine systems must **not** run while in replay mode. Pause the
  engine before entering replay; resume only when explicitly exiting.
- Recording must be disabled in replay mode (set `disabledReason` on
  `RecordingPanel`).

1. ReplaySession (simulation-side, pure logic)

Create `src/simulation/recording/ReplaySession.ts`:

```ts
import type { ReplayFileFormat } from "./ReplayFormat";
import type { SimulationFrameSnapshot } from "./SimulationFrameSnapshot";

export class ReplaySession {
  constructor(replay: ReplayFileFormat);

  getReplay(): ReplayFileFormat;
  getFrameCount(): number;
  getDurationSec(): number;
  getFixedDtSec(): number;

  getCurrentIndex(): number;
  getCurrentFrame(): SimulationFrameSnapshot;

  getFrame(index: number): SimulationFrameSnapshot;

  seekToFrame(index: number): void;
  seekToTime(timeSec: number): void;
  stepForward(count?: number): void;
  stepBackward(count?: number): void;

  reset(): void;

  /** Subscribe to current-index changes. Returns an unsubscribe fn. */
  onChange(listener: (index: number) => void): () => void;
}
```

Rules:

* Pure logic. No React, no DOM, no timers.
* Bounds-clamped: `seekToFrame(-1)` resolves to index 0; out-of-range
  indices clamp to `frameCount - 1`.
* `seekToTime(t)` finds the first frame whose `timeSec >= t`, or the
  last frame if `t > duration`. Document the lookup policy (linear
  scan is fine for the first version; consider a binary search if
  recordings are large).
* `getDurationSec()` returns `lastFrame.timeSec - firstFrame.timeSec`,
  or `0` for empty/single-frame recordings.
* `onChange` is the only observation surface — UI uses it to repaint.

2. Replay state adapter (renderer-friendly)

Create `src/simulation/recording/createReplayStateFromFrame.ts`:

```ts
import type { SimulationState } from "../core/SimulationState";
import type { SimulationFrameSnapshot } from "./SimulationFrameSnapshot";

/**
 * Returns a read-only `SimulationState`-shaped view backed by a single
 * recorded frame. Renderers consume this exactly as they consume the
 * live state.
 *
 * Caller contract:
 * - The returned object MUST NOT be mutated.
 * - The returned object is invalidated when the underlying frame is
 *   replaced; do not retain references across `seek*` calls.
 */
export function createReplayStateFromFrame(
  frame: SimulationFrameSnapshot,
  fixedDtSec: number,
): SimulationState;
```

Rules:

* Reconstruct `state.clock` so it reports `frame.tick` and
  `frame.timeSec` via the same public API renderers already use.
* Reconstruct `state.entities` so `entities.toArray()` returns lightweight
  view objects matching the entity contracts renderers consume:
  * `VehicleEntity`-like: `id`, `pose.position`, `pose.yaw`, optional
    `velocity`, optional `radius`. Use frozen plain objects, not
    instances of `VehicleEntity`. Keep the surface small enough that
    no renderer reaches into private fields.
  * Same for `StaticObstacleEntity` and `DynamicActorEntity`.
* If `state.trajectories` is consumed by renderers, expose an empty
  `TrajectoryRegistry`-shaped view (no historical samples are
  reconstructed in this phase). Document the limitation.
* No mutation paths: setters must throw or be omitted.
* No imports from React/Three/Phaser/DOM. The adapter is renderer-agnostic.

Phase-3 limitation note: trajectories during replay can be addressed in a
follow-up by accumulating frames on the fly inside the adapter or by
recording trajectories explicitly into the replay file. Out of scope here.

3. ReplayFileLoader (UI-side)

Create `src/ui/replay/ReplayFileLoader.ts`:

```ts
import {
  REPLAY_FORMAT_TAG,
  REPLAY_FORMAT_VERSION,
  type ReplayFileFormat,
} from "../../simulation/recording/ReplayFormat";

export type LoadReplayResult =
  | { ok: true; replay: ReplayFileFormat }
  | { ok: false; error: string };

export async function readReplayFromFile(file: File): Promise<LoadReplayResult>;

export function parseReplayJson(text: string): LoadReplayResult;
```

Validation policy (for `parseReplayJson`):

* `JSON.parse` failures → `{ ok: false, error: "Invalid JSON: …" }`.
* `format !== REPLAY_FORMAT_TAG` → format error.
* `version !== REPLAY_FORMAT_VERSION` → unsupported version error.
* `Array.isArray(frames) === false` → malformed error.
* Each frame: `Number.isFinite(tick)`, `Number.isFinite(timeSec)`,
  `Array.isArray(entities)` — first failure short-circuits with a
  helpful message.
* `Number.isFinite(fixedDtSec)` and `fixedDtSec > 0`.

Rules:

* No simulation imports beyond the `ReplayFileFormat` type and the two
  format constants from Phase 1.
* DOM File APIs allowed. No `fs`. No Node APIs.
* Pure parser is unit-testable without a DOM (`parseReplayJson`).

4. ReplayPlayer (UI-side timer driver, optional but recommended)

Create `src/ui/replay/ReplayPlayer.ts`:

```ts
import type { ReplaySession } from "../../simulation/recording/ReplaySession";

export type ReplayPlayerOptions = {
  /** Multiplier on real time (1 = recorded speed). */
  speed?: number;
  /** Schedule next frame; defaults to requestAnimationFrame. */
  scheduler?: (cb: () => void) => () => void;
};

export class ReplayPlayer {
  constructor(session: ReplaySession, options?: ReplayPlayerOptions);

  isPlaying(): boolean;
  play(): void;
  pause(): void;
  toggle(): void;

  setSpeed(speed: number): void;
  getSpeed(): number;

  dispose(): void;
}
```

Rules:

* Drives `session.stepForward()` according to a real-time clock.
* When the session reaches the last frame, the player auto-pauses.
* The scheduler is injectable so tests can run without a DOM.
* Pure UI helper. No simulation mutation.

5. Timeline UI

Create `src/ui/replay/ReplayTimeline.tsx`:

Layout (placed below the renderer when in replay mode):

* Play/Pause button (toggle).
* Step backward / Step forward buttons.
* Time display: `current / duration` formatted as `mm:ss.s`.
* Frame display: `frame index / total`.
* Slider: range `0 .. frameCount - 1`. Dragging seeks; releasing
  resumes the prior playing/paused state.
* Optional: speed selector (`0.25x / 0.5x / 1x / 2x / 4x`).
* "Exit replay" button on the right.

Component contract:

```ts
export interface ReplayTimelineProps {
  frameCount: number;
  currentIndex: number;
  durationSec: number;
  currentTimeSec: number;
  isPlaying: boolean;
  speed: number;

  onSeekFrame: (index: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onSpeedChange?: (speed: number) => void;
  onExit: () => void;
}
```

Rules:

* Dumb/controlled component. All state lives in the parent (`App.tsx`).
* No direct access to `ReplaySession` or `ReplayPlayer`.
* No simulation imports beyond shared types.

6. Replay-load button (UI)

Either co-locate inside `RecordingPanel.tsx` under a "Replay" sub-section,
or add a small `src/ui/replay/ReplayLoadButton.tsx` with:

* `<input type="file" accept=".json,.angy-replay.json" hidden ref={...} />`.
* A button that triggers the input.
* On change: `await readReplayFromFile(file)`, route the result to a
  parent-supplied callback `onLoaded(replay)` / `onError(message)`.

Rules:

* Lives in `src/ui/replay/**`.
* Validates via `ReplayFileLoader`.
* Surfaces errors via the existing toast/`console.error` pattern.

7. App-level mode switching

Update `src/app/App.tsx`:

* Add `runMode: "live" | "replay"` state, defaulting to `"live"`.
* Track `replaySession?: ReplaySession`, `replayPlayer?: ReplayPlayer`,
  `replayState?: SimulationState` (the adapter view).
* Handlers:
  * `handleReplayLoaded(replay)`:
    1. `controller.pause()` (or whatever the engine's pause API is).
    2. `controller.stopRecording()` if currently recording (defensive).
    3. Construct a new `ReplaySession(replay)` and a new `ReplayPlayer`.
    4. Subscribe to `session.onChange(...)`: on each change, build a
       fresh `replayState` via `createReplayStateFromFrame` and trigger
       a renderer repaint (see step 8).
    5. Set `runMode = "replay"`.
  * `handleExitReplay()`:
    1. Dispose `replayPlayer` and `replaySession`.
    2. Reset `replayState` and `runMode = "live"`.
    3. Optionally: re-render the live state once so the canvas is
       in sync immediately (do not auto-resume the engine — leave that
       to the user via the existing Start button).
* Replay/recording UI guards:
  * Pass `disabledReason="Recording is paused while a replay is loaded."`
    to `RecordingPanel` whenever `runMode === "replay"`.
  * `<ReplayTimeline>` and `<ReplayLoadButton>` (if extracted) are
    rendered conditionally on `runMode`.
* No live engine ticks while `runMode === "replay"`. Make sure the
  paused-engine state already short-circuits tick events; if it does
  not, gate the renderer subscription on `runMode === "live"` (see
  step 8 below).

8. Renderer wiring

Update `src/ui/viewport/SimulationViewportSwitcher.tsx`
(and/or whichever React glue calls `renderer.render(state)`):

* When `runMode === "live"`:
  * Behave exactly as today. Renderer subscribes to engine events
    (`tick`, `reset`, `scenarioLoaded`, ...).
* When `runMode === "replay"`:
  * Unsubscribe from engine events (or gate them with a `runMode`
    check). The engine is paused but defensive ignoring is cheaper
    than relying on the pause flag.
  * Subscribe to a `replayState` prop change. Each new `replayState`
    triggers `renderer.render(replayState)`.
  * The renderer code path is unchanged — it just sees a different
    `SimulationState`-shaped object.

Rules:

* Do not introduce a "render mode" inside the renderer. The renderer
  remains rendering-mode-agnostic.
* Do not mutate the live `engine.state` while in replay mode.

9. Optional events

Extend the simulation event bus only if it makes the integration
cleaner:

```text
replayLoaded(replay: ReplayFileFormat)
replayExited()
```

These can also live as React state callbacks on the App side. Pick the
existing pattern; do not add a new event system.

10. Tests

Add tests under `src/simulation/recording/` and `src/ui/replay/`:

`ReplaySession.test.ts`:

* construction with a valid `ReplayFileFormat` populates frame count
  and duration.
* `seekToFrame` clamps to `[0, frameCount-1]`.
* `seekToTime` resolves to the first frame whose `timeSec >= t`.
* `stepForward(n)` and `stepBackward(n)` clamp at the bounds.
* `onChange` fires with the new index after each successful seek/step,
  and does NOT fire when a clamped operation does not change the index.
* `reset()` returns to index 0 and emits a change event if needed.

`createReplayStateFromFrame.test.ts`:

* maps each `EntitySnapshot.kind` to the expected entity shape.
* `state.clock` reports `frame.tick` / `frame.timeSec`.
* mutating returned objects throws or is otherwise prevented.
* renderer-shaped APIs (`state.entities.toArray()`,
  `state.entities.byType(...)` if used) work.

`parseReplayJson.test.ts` / `readReplayFromFile.test.ts`:

* accepts a valid replay produced by Phase 1's `exportRecording()`.
* rejects wrong `format`.
* rejects unsupported `version`.
* rejects missing `frames` array.
* rejects malformed frames (non-finite tick/time, missing entities).
* clear, user-readable error messages.

`ReplayPlayer.test.ts` (with an injected scheduler):

* `play()` schedules forward steps through the session.
* `pause()` cancels pending steps.
* auto-pauses on the last frame.
* `setSpeed` adjusts step cadence proportionally.

Architecture/import tests:

* `src/simulation/recording/ReplaySession.ts` and
  `createReplayStateFromFrame.ts` import nothing from `src/ui/**` or
  any DOM/Three/Phaser/React/WebSocket/ROS2/DDS/Rapier module.
* `src/ui/replay/**` is not imported from `src/simulation/**`.

End-to-end smoke test (manual):

* Record a short run via Phase 2 UI.
* Download the file.
* Click "Load replay" with the same file → app enters replay mode.
* Timeline shows correct duration and frame count.
* Play / pause / scrub all update the canvas in real time.
* Exit replay → live mode restored, canvas in sync, recording panel
  re-enabled, engine still paused (user must press Start to resume).

11. Documentation updates

Update `Architecture.md`'s recording/replay section:

```text
Phase 3 introduces:
- ReplaySession (simulation-side, pure logic)
- createReplayStateFromFrame (read-only state adapter)
- ReplayFileLoader (DOM-aware JSON parser)
- ReplayPlayer (UI-side timer driver)
- ReplayTimeline (UI control surface)
- App-level SimulationRunMode = "live" | "replay" with mutually
  exclusive guard rails.

Replay is playback, not resimulation. Live simulation systems do not
run during replay. Renderers stay agnostic: they consume the same
SimulationState shape regardless of mode.
```

Update `Development_Guide.md` with replay rules:

* replay playback must not mutate live simulation state
* live engine must be paused before entering replay mode
* recording UI must be disabled while in replay mode
* renderers must not contain replay-specific branches
* DOM File parsing lives only in `src/ui/replay/**`

12. Expected result after Phase 3

* The Inspector exposes a "Load replay" control that accepts the
  `.angy-replay.json` files produced in Phase 2.
* Loading a valid file pauses the live engine and switches the app
  into replay mode.
* A timeline appears below the renderer with play/pause, step
  forward/backward, slider scrub, time display, and exit.
* The renderer shows the recorded frames with no replay-specific
  branches in renderer code.
* Live simulation systems do not run during replay; vehicle commands
  are not produced; collision/dynamics are silent.
* Exiting replay returns the app to live mode in a clean state. The
  user explicitly resumes the live engine via the existing Start
  control.
* Architecture invariants are intact:
  - `src/simulation/recording/**` has no UI/DOM/Three/Phaser imports.
  - `src/ui/replay/**` is not imported from `src/simulation`.
  - Renderers remain read-only consumers of `SimulationState`.
* The full test suite passes; `npm run build` passes; no new linter
  warnings introduced.
````
