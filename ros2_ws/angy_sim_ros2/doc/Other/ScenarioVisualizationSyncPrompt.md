Based on `ros2_ws/angy_sim_ros2/doc/Architecture.md` and `ros2_ws/angy_sim_ros2/doc/Development_Guide.md`, implement bidirectional synchronization between ROS2 topic visualization controls and the Scenario Editor JSON, preserving transport-agnostic boundaries.

## Objective

When the user changes ROS2 topic visualization controls in `Ros2TopicsPanel` (checkbox select/deselect, color, etc.), those changes should be reflected in the Scenario Editor JSON under a new optional `visualization` block.

At the same time, scenario JSON that includes `visualization.ros2Topics` should still be loadable and applied at runtime (existing requirement).

---

## Product behavior required

### A) Reflect UI clicks into Scenario Editor JSON (NEW)
When the user interacts with a topic row in `Ros2TopicsPanel`:

- Toggling render checkbox
- Changing color HEX (and valid color picker changes)
- (If thickness is later re-enabled) changing thickness

the `ScenarioEditorPanel` text (`currentScenarioText`) must update so the `visualization.ros2Topics` section reflects current topic visualization state.

### B) Keep editor/manual edits safe
Do **not** overwrite user text while they are manually typing invalid or partial JSON.

Policy:
1. If current editor text parses successfully as scenario JSON:
   - Merge visualization updates into the parsed scenario object.
   - Re-serialize with `formatScenarioJson(...)`.
2. If current editor text is invalid JSON:
   - Do not auto-rewrite text.
   - Keep runtime behavior working.
   - Optionally store pending visualization changes and apply when JSON becomes valid again (or on next Apply).

### C) Scope of persistence
Persist only **selected/render-enabled** renderable topics into `visualization.ros2Topics` by default.
(If a topic is deselected, remove it from the persisted `visualization.ros2Topics` array.)

---

## Architecture constraints

1. No `roslib` imports outside `src/infrastructure/communication/rosbridge/`.
2. No ROS-specific logic in `src/simulation/core/`, `src/math/`, or renderers.
3. Scenario parsing/validation remains in `src/simulation/scenarios/ScenarioLoader.ts`.
4. `Ros2TopicsPanel` must stay capability-driven (`useRenderableTopics`) and not know scenario parser internals.
5. Synchronization glue should live in app layer (`App.tsx` and/or helper in `src/ui/scenario/`).

---

## Data contract (must be implemented/used)

Extend scenario schema/types to include:

```ts
visualization?: {
  ros2Topics?: Array<{
    topic: string
    messageType: string
    enabled?: boolean
    style?: {
      color?: string      // #RRGGBB
      thickness?: number  // optional for future/renderer support
    }
  }>
}
```

Validation in `ScenarioLoader`:
- `topic`: non-empty string
- `messageType`: non-empty string
- `enabled`: optional boolean
- `style.color`: optional, must match `/^#[0-9a-fA-F]{6}$/`
- `style.thickness`: optional finite number > 0

Backward compatible: scenarios without `visualization` still work.

---

## Implementation plan (required)

### 1) Ensure scenario types + parser support visualization
Files:
- `src/simulation/scenarios/Scenario.ts`
- `src/simulation/scenarios/ScenarioLoader.ts`

Add the `visualization` contract and parser validation as above.

### 2) Add app-layer sync helper
Create helper module (suggested):
- `src/ui/scenario/ScenarioVisualizationSync.ts`

Include pure functions:
- `buildVisualizationFromRenderableSelections(...)`
- `mergeVisualizationIntoScenario(spec, visualization)`
- `trySyncVisualizationIntoScenarioText(text, visualization)` returning:
  - `{ ok: true; text: string; spec: ScenarioSpec }`
  - `{ ok: false; reason: string }`

Keep this helper pure + unit-testable.

### 3) Wire sync in App layer
File:
- `src/app/App.tsx`

Add a reactive sync mechanism:
- Observe renderable capability state (`selectedTopics`, and per-topic visual config).
- Build `visualization.ros2Topics` snapshot from capability.
- Attempt to merge into current scenario text using helper.
- Update:
  - `currentScenarioSpec`
  - `currentScenarioText`
only when sync succeeds and actually changes content.
- Avoid infinite loops (compare serialized output before setting state).
- If sync fails due to invalid JSON in editor:
  - skip rewriting text
  - do not break runtime interactions.

### 4) Keep load/apply flow consistent
Existing flow on scenario load/apply should still:
- parse scenario JSON
- apply runtime visualization through capability (`selectTopic`, `setVisualConfig`)
- now also preserve/round-trip visualization in editor text.

---

## UI behavior details

- `Ros2TopicsPanel` remains source of truth for live visualization interactions.
- Scenario Editor becomes a persisted projection of current visualization state.
- No additional UI controls required unless necessary for UX clarity.
- Keep existing dark style and compact layout untouched.

---

## Tests required

### Scenario parser tests
File:
- `src/simulation/scenarios/ScenarioLoader.test.ts`
Add cases:
- parses valid visualization block
- rejects invalid color
- rejects invalid thickness
- accepts missing visualization

### Sync helper tests
New file:
- `src/ui/scenario/ScenarioVisualizationSync.test.ts`
Add cases:
- builds visualization from selected topics
- merges visualization into scenario spec
- updates valid scenario text
- no-op or graceful fail on invalid JSON text

### App integration tests
File:
- `src/app/App` related tests (or closest existing app-level tests)
Add cases:
- selecting render topic updates scenario editor text visualization block
- changing color updates corresponding topic style.color in text
- deselecting topic removes it from visualization.ros2Topics
- invalid editor JSON prevents auto-text rewrite but does not crash

### Guard test
Keep/extend:
- no roslib imports outside `src/infrastructure/communication/rosbridge/`

---

## Acceptance criteria

1. User selects `/circle_path` render checkbox → scenario editor JSON gains:
   - `visualization.ros2Topics[{ topic: "/circle_path", messageType: "...", enabled: true, style: {...} }]`
2. User changes color in panel → JSON `style.color` updates accordingly.
3. User deselects topic → topic entry removed (or disabled if you choose that policy consistently and test it).
4. Existing scenarios without visualization remain valid.
5. Typecheck and tests pass.

---

## Commands to run

- `npx tsc --noEmit`
- `npx vitest run`

Report:
1. Files changed.
2. Sync strategy used to avoid overwrite/infinite loops.
3. Behavior when editor JSON is invalid.
4. Example before/after scenario JSON snippet showing visualization sync.
