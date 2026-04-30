## Prompt 2: UI para iniciar / detener / descargar grabaciones

````text
I want to implement Phase 2 of simulation recording/replay support in `angy_sim_ros2`.

Context:
- Phase 1 already created:
  - `src/simulation/recording/ReplayFormat.ts`
  - `src/simulation/recording/SimulationFrameSnapshot.ts`
  - `src/simulation/recording/createSnapshotFromState.ts`
  - `src/simulation/recording/SimulationRecorder.ts`
  - `src/simulation/recording/SimulationRecorderSystem.ts`
  - Engine/controller APIs: `startRecording`, `stopRecording`, `clearRecording`, `isRecording`, `getRecordingStatus`, `getRecordingFrameCount`, `setRecordingConfig`, `getRecordingConfig`, `exportRecording`.
  - The recorder system is registered after dynamics/collision/metrics.
  - Phase 1 tests pass.
- Replay loading and playback are deferred to Phase 3.
- Follow `Architecture.md` and `Development_Guide.md`.

Phase 2 goal:
Add an Inspector "Recording" section that lets the user start/stop/clear recording and download the resulting `.angy-replay.json` file. No replay loading, no timeline, no playback yet — those belong to Phase 3.

Important design decisions:
- Do not put DOM/Blob/anchor code inside `src/simulation`.
- File download helpers live exclusively in `src/ui/replay/`.
- The UI must call `SimulationController` APIs; it must never read or mutate `SimulationRecorder` internals directly.
- Recording is a live-mode-only operation in this phase. Phase 3 will introduce a replay mode and add the live↔replay guard rails.
- Do not redesign the simulation core. Do not move sampling out of `SimulationRecorderSystem`.
- Do not add CSV export in this phase.

Expected architecture after Phase 2:

```text
SimulationController.startRecording / stopRecording / clearRecording / setRecordingConfig
                |
                v
SimulationEngine -> SimulationRecorder
                       ^
                       | append frames each tick
                SimulationRecorderSystem

UI (Inspector "Recording" panel)
  -> reads status from SimulationController.getRecordingStatus
  -> calls start/stop/clear/setRecordingConfig
  -> calls exportRecording when user clicks "Download"
  -> hands the ReplayFileFormat to ReplayFileDownloader
                                          |
                                          v
                                  Blob + anchor download (DOM)
```

Files to create:

```text
src/ui/replay/ReplayFileDownloader.ts
src/ui/RecordingPanel.tsx       (or src/ui/inspector/RecordingPanel.tsx,
                                  whichever matches the existing Inspector layout)
```

Files to update:

```text
src/app/App.tsx
src/ui/RendererSettingsPanel.tsx (only if recording UI is co-located there;
                                  otherwise keep recording UI in its own panel)
```

Architecture rules:
- `src/ui/replay/**` may use DOM APIs (`Blob`, `URL.createObjectURL`, `<a>` elements). It must not be imported from `src/simulation` or `src/math`.
- `src/simulation/**` must not import `src/ui/replay/**` and must not introduce any new DOM dependency.
- The Recording panel must call only `SimulationController` methods — no direct access to `SimulationRecorder` or its frame buffer.
- Recording UI must not start while in replay mode (replay mode arrives in Phase 3; for now leave a hook so Phase 3 can disable the UI cleanly).

1. File download helper

Create `src/ui/replay/ReplayFileDownloader.ts`:

```ts
import type { ReplayFileFormat } from "../../simulation/recording/ReplayFormat";

export type DownloadReplayOptions = {
  /** Base name without extension. The helper appends a timestamp + suffix. */
  baseName?: string;
  /** Override the timestamp source for tests; defaults to `Date.now()`. */
  now?: () => number;
};

export function buildReplayFileName(
  replay: ReplayFileFormat,
  options?: DownloadReplayOptions,
): string {
  // Returns: `${base}-replay-${timestamp}.angy-replay.json`
  // base = options.baseName ?? replay.scenarioName ?? "simulation"
  // timestamp = ISO-like compact string derived from options.now() ?? Date.now()
}

export function downloadReplay(
  replay: ReplayFileFormat,
  options?: DownloadReplayOptions,
): void {
  // 1. JSON.stringify(replay, null, 2)
  // 2. new Blob([json], { type: "application/json" })
  // 3. URL.createObjectURL(blob)
  // 4. Create a hidden <a download={name} href={url}>; document.body.appendChild
  // 5. anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
}
```

Rules:

* Pure DOM-side helper. No simulation imports beyond `ReplayFileFormat` types.
* Splits naming from downloading so `buildReplayFileName` is unit-testable without a DOM.
* `downloadReplay` is intentionally void; failures are logged via `console.error` (the existing UI pattern).

2. Recording UI panel

Create `src/ui/RecordingPanel.tsx` (or `src/ui/inspector/RecordingPanel.tsx` if the Inspector lives in a subfolder):

Sections and controls:

* Status row
  * "Idle" / "Recording" badge driven by `controller.getRecordingStatus()`.
  * Frame count (live-updating).
  * "Max frames reached" warning when `status.maxFramesReached === true`.
* Config row
  * Checkbox: "Enable recording" (binds to `recordingConfig.enabled`).
    Note: enabling alone does NOT start recording — see `Start`/`Stop`.
  * Number input: "Sample every N ticks" (≥ 1, integer).
  * Number input: "Max frames" (≥ 100, integer).
* Action row
  * Button: **Start recording**. Disabled when recording is already active or when not in live mode (Phase 3 hook — for now, always enabled outside the active state).
  * Button: **Stop recording**. Disabled when not recording.
  * Button: **Clear recording**. Disabled when frame count is 0.
  * Button: **Download recording**. Disabled when frame count is 0.
* Optional: small info hint linking the user to Phase 3 once it ships.

Component contract:

```ts
export interface RecordingPanelProps {
  status: SimulationRecorderStatus;
  config: SimulationRecorderConfig;
  onConfigChange: (config: Partial<SimulationRecorderConfig>) => void;
  onStart: () => void;
  onStop: () => void;
  onClear: () => void;
  onDownload: () => void;
  /**
   * Set to true once Phase 3 introduces replay mode. The panel
   * disables Start/Stop/Clear/Download with a tooltip explaining that
   * recording is paused while replaying.
   */
  disabledReason?: string;
}

export function RecordingPanel(
  props: Readonly<RecordingPanelProps>,
): JSX.Element;
```

Rules:

* The panel is **dumb** (controlled component): all state lives in the parent (`App.tsx`).
* The panel reads only from props; it does not call `controller` directly.
* No DOM/file APIs inside the panel (the parent decides what `onDownload` does).
* Match the visual style of `RendererSettingsPanel` (`<section className="panel ...">`, `renderer-settings-grid`, `renderer-settings-row`, `renderer-settings-actions`).

3. App-level wiring

Update `src/app/App.tsx`:

* Add state: `recordingStatus: SimulationRecorderStatus`, `recordingConfig: SimulationRecorderConfig`.
* Sync `recordingStatus` from the controller:
  * Initial fetch on mount.
  * Subscribe to `recordingStarted`, `recordingStopped`, `recordingCleared`, `recordingMaxFramesReached` events if Phase 1 added them; otherwise refresh on `tick` (rate-limited) or via a small `useInterval` (e.g. every 250 ms).
* Sync `recordingConfig` from the controller on mount and on `scenarioLoaded`.
* Handlers:
  * `handleRecordingConfigChange(partial)` → `controller.setRecordingConfig(partial)` → refresh local state.
  * `handleStartRecording()` → `controller.startRecording()`.
  * `handleStopRecording()` → `controller.stopRecording()`.
  * `handleClearRecording()` → `controller.clearRecording()`.
  * `handleDownloadRecording()` → const replay = `controller.exportRecording()`; `downloadReplay(replay, { baseName: scenarioName })`. Log a warning when frame count is 0 (but the button should already be disabled in that case).
* Render the `RecordingPanel` inside the Inspector `<aside>` next to `RendererSettingsPanel`.
* Pass `disabledReason={undefined}` for now. Phase 3 will set it to `"Recording is paused while a replay is loaded."` when the app is in replay mode.

4. Validation rules (UI-side)

* "Sample every N ticks" must be a positive integer; clamp on blur.
* "Max frames" must be ≥ 100; clamp on blur.
* "Download recording" button is disabled when `status.frameCount === 0`.
* Clearing a non-empty recording is allowed without confirmation in Phase 2; Phase 3 may add a confirm dialog if it lands in the same UI.
* Configuration changes that occur mid-recording take effect on the next tick. Document this in a small hint under the config row.

5. Tests

Add tests under `src/ui/replay/` and (if your project tests UI components) `src/ui/`:

`buildReplayFileName.test.ts`:

* uses `replay.scenarioName` when `options.baseName` is omitted.
* falls back to `"simulation"` when neither is present.
* timestamp is deterministic when `options.now` is provided.
* output ends with `.angy-replay.json`.

`downloadReplay.test.ts` (DOM-side, requires jsdom or vitest's DOM env):

* creates a Blob with `type: "application/json"`.
* sets `<a download>` to the expected file name.
* clicks the anchor and revokes the object URL.
* never imports `src/simulation/recording/SimulationRecorder` (it works only with the public `ReplayFileFormat` type).

`RecordingPanel.test.tsx` (if a component-test runner is already configured):

* renders frame count and recording badge from `status`.
* disables "Stop" when not recording.
* disables "Download" when `frameCount === 0`.
* invokes `onConfigChange` with the patched field on input change.
* shows the `disabledReason` tooltip and disables actions when it is non-empty.

Architecture/import tests:

* No file in `src/simulation/**` imports `src/ui/replay/**`.
* No file in `src/ui/replay/**` imports `src/simulation/recording/SimulationRecorder` (the controller is the only allowed surface).

6. Documentation updates (Phase 2 portion)

Update `Architecture.md`'s recording/replay section:

```text
Phase 2 (UI) introduces:
- src/ui/replay/ReplayFileDownloader.ts: DOM-aware Blob + anchor download.
- src/ui/RecordingPanel.tsx: Inspector panel for start/stop/clear/download.
- App-level wiring that maps panel events onto SimulationController APIs.

The UI never accesses SimulationRecorder directly. It calls
SimulationController.exportRecording() and hands the resulting
ReplayFileFormat to the file download helper.
```

Update `Development_Guide.md`:

* DOM/Blob/file download code lives in `src/ui/replay/**`. Never in `src/simulation/**`.
* Inspector panels are dumb/controlled — App.tsx owns state and wiring.
* Recording config edits go through `SimulationController.setRecordingConfig`.

7. Expected result after Phase 2

* The Inspector has a "Recording" panel with start/stop/clear/download and config inputs.
* Clicking **Start** flips the engine into recording mode; subsequent ticks accumulate frames.
* Clicking **Download** produces a `<scenarioName>-replay-<timestamp>.angy-replay.json` file in the user's downloads folder.
* The downloaded JSON validates against `ReplayFileFormat` (`format`, `version`, `frames`, `fixedDtSec`).
* The simulation/architecture invariants from Phase 1 are still in place.
* Replay loading/playback do **not** exist yet — that is Phase 3.
* The full test suite passes; `npm run build` passes; no new linter warnings introduced.
````
