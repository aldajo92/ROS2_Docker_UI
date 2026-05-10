# Scenario Connections / Actions / Displays Schema Migration Prompt

Use this prompt when asking an AI coding agent to migrate the Scenario Editor
schema away from the current split:

```json
{
  "interaction": {
    "ros2TwistControls": []
  },
  "visualization": {
    "ros2Topics": []
  }
}
```

to the proposed explicit scenario schema:

```json
{
  "connections": {
    "rosbridge": {
      "kind": "rosbridge",
      "url": "ws://localhost:9090"
    }
  },
  "actions": [
    {
      "source": {
        "connection": "rosbridge",
        "topic": "/cmd_vel",
        "messageType": "geometry_msgs/msg/Twist"
      },
      "target": {
        "kind": "vehicle",
        "id": "ego"
      },
      "enabled": true
    }
  ],
  "displays": [
    {
      "source": {
        "connection": "rosbridge",
        "topic": "/circle_path",
        "messageType": "nav_msgs/msg/Path"
      },
      "enabled": true
    },
    {
      "source": {
        "connection": "rosbridge",
        "topic": "/pose_array",
        "messageType": "geometry_msgs/msg/PoseArray"
      },
      "enabled": true,
      "style": {
        "color": "#00bcd4",
        "thickness": 2,
        "arrowSize": 0.5
      }
    }
  ]
}
```

## Prompt

You are working in the `angy_sim_ros2` project.

Before coding, read and follow:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Plugins.md`
- `doc/Topic_Support_Guide.md`

## Goal

Migrate scenario topic configuration to a clearer, future-proof schema that
separates:

- `connections`: how external sources are reached.
- `actions`: external inputs that manipulate simulation behavior.
- `displays`: external inputs that render simulator artifacts.

The first supported connection kind is `rosbridge`, but the schema must not
prevent future support for `websocket`, `wasm`, `dds`, `mqtt`, or other
connection kinds.

## Design Decision

Use this new scenario shape:

```ts
type ScenarioConnections = Record<string, ScenarioConnectionSpec>

type ScenarioConnectionSpec =
  | {
      kind: 'rosbridge'
      url?: string
    }
  // Future extension only. Do not implement these unless requested:
  // | { kind: 'websocket'; url: string }
  // | { kind: 'wasm'; ... }

type ScenarioTopicSource = {
  connection: string
  topic: string
  messageType: string
}

type ScenarioActionSpec = {
  source: ScenarioTopicSource
  target?: {
    kind: 'vehicle'
    id: string
  }
  enabled?: boolean
  scale?: {
    v?: number
    w?: number
  }
  limits?: {
    maxForwardSpeed?: number
    maxReverseSpeed?: number
    maxAngularSpeed?: number
  }
  timeoutSec?: number
  onTimeout?: 'stop'
}

type ScenarioDisplaySpec = {
  source: ScenarioTopicSource
  enabled?: boolean
  style?: {
    color?: string
    thickness?: number
    arrowSize?: number
  }
}
```

Do **not** include a separate `type`, `action`, or `display` field in the
scenario entries for now.

Reason:

- `messageType` describes the external wire format.
- The container (`actions[]` or `displays[]`) describes the simulator intent.
- The program can derive the supported runtime behavior from
  `container + messageType`.
- Adding a second semantic field creates invalid combinations like
  `geometry_msgs/msg/Twist` + `poseArray2d`.

Current mappings:

```text
actions[] + geometry_msgs/msg/Twist
  -> vehicle control
  -> target.kind must be "vehicle"
  -> target.id is required
  -> RosTwistToVehicleCommandAdapter
  -> VehicleCommandTopicBridge
  -> VehicleCommandQueue

displays[] + nav_msgs/msg/Path
  -> path2d display
  -> RosPathToPath2DAdapter
  -> PathDisplayPlugin
  -> ExternalPathUpdateQueue
  -> ExternalPathRenderSystem
  -> state.paths

displays[] + geometry_msgs/msg/PoseArray
  -> pose_array_2d display
  -> RosPoseArrayToPoseArray2DAdapter
  -> PoseArrayDisplayPlugin
  -> ExternalPoseArrayUpdateQueue
  -> ExternalPoseArrayRenderSystem
  -> state.poseArrays
```

Invalid combinations must be rejected with clear parse errors:

```text
actions[] + nav_msgs/msg/Path               -> invalid
actions[] + geometry_msgs/msg/PoseArray     -> invalid
displays[] + geometry_msgs/msg/Twist        -> invalid
unknown messageType in either container     -> invalid for now
unknown connection reference                -> invalid
connection kind other than rosbridge        -> invalid for now
```

## Non-Negotiable Architecture Rules

Preserve these rules:

- `src/simulation/` and `src/math/` must not import React, DOM, Three.js,
  Phaser, `roslib`, rosbridge infrastructure, WebSocket APIs, or vendor code.
- Scenario parsing types may live in `src/simulation/scenarios/`, but the
  simulation core must not connect to rosbridge or create subscriptions.
- Transport-specific behavior stays under
  `src/infrastructure/communication/rosbridge/`.
- React/App-layer glue owns applying scenario-declared connections/actions/
  displays into live UI/runtime state.
- Display topic callbacks must enqueue updates into simulation queues; they
  must not mutate `SimulationState` directly.
- Control topic callbacks must push `VehicleCommand`s into
  `VehicleCommandQueue`; they must not call `vehicle.setCommand(...)`
  directly.
- Selecting a transport alone must not activate any topic.
- A topic becomes active only if selected by the user or declared enabled in
  the scenario.
- Toggling one topic must not reconnect rosbridge or reset topic discovery.
- Do not spread scenario topic schema knowledge across many components.
  Centralize parsing/projection/normalization in a small dedicated module so
  future schema changes do not require editing unrelated UI/runtime files.

## Breaking-Change Requirement

This is an intentional breaking schema migration.

Do **not** preserve runtime support for the legacy fields:

- `interaction.ros2TwistControls`
- `visualization.ros2Topics`

After this migration, the supported scenario fields are:

- `connections`
- `actions`
- `displays`

Old scenarios must be updated to the new schema. Prefer failing loudly with a
clear parse error when legacy topic config is present, instead of silently
ignoring it.

Also audit and update any Scenario Editor fixtures, sample JSON strings, test
fixtures, documentation snippets, or bundled scenarios that still contain the
legacy shape. This includes any hardcoded editor text in tests, stories,
examples, docs, or local scenario files.

Required parser behavior:

- Reject `interaction.ros2TwistControls` with a clear error telling the user to
  use `actions[]`.
- Reject `visualization.ros2Topics` with a clear error telling the user to use
  `displays[]`.
- Keep `interaction.keyboardControl` only if it is still part of the project
  requirements. If you remove or relocate it, update its tests/docs in the
  same change. Do not accidentally remove keyboard-control behavior.
- The Scenario Editor must write only the new schema.
- Bundled/sample scenario JSON files must be migrated in the same change.

## Suggested Implementation Phases

### Phase 1 — Types and Parser

Modify `src/simulation/scenarios/Scenario.ts` and `ScenarioLoader.ts`.

Add scenario types:

- `ScenarioConnectionsConfig`
- `ScenarioConnectionSpec`
- `ScenarioTopicSource`
- `ScenarioActionSpec`
- `ScenarioDisplaySpec`

Add optional fields to `ScenarioSpec`:

```ts
connections?: ScenarioConnectionsConfig
actions?: ScenarioActionSpec[]
displays?: ScenarioDisplaySpec[]
```

Parser rules:

- Validate `connections` is an object keyed by non-empty connection ids.
- Validate connection ids are referenced by `actions[].source.connection` and
  `displays[].source.connection`.
- For now, accept only `kind: 'rosbridge'`.
- `url` is optional. If absent, keep using the current UI/provider default.
- Validate `source.topic` and `source.messageType` are non-empty strings.
- Validate `enabled` is boolean when present.
- Validate display `style` with the existing style constraints
  (`color`, `thickness`, `arrowSize`).
- Validate Twist `scale`, `limits`, `timeoutSec`, `onTimeout` exactly like
  the current Twist binding constraints.
- Reject unsupported `container + messageType` combinations.
- Reject legacy `interaction.ros2TwistControls`.
- Reject legacy `visualization.ros2Topics`.

### Phase 2 — Normalization Helpers

Create a dedicated pure module, preferably:

```text
src/ui/scenario/ScenarioTopicConfig.ts
```

or a similarly named app-layer module.

This module should be the single app-side place that knows how to convert
between scenario topic config and runtime UI state. It should convert:

- `actions[]` -> `Ros2TwistTopicBindingState[]`.
- `displays[]` -> renderable-topic apply entries.
- live `Ros2TwistTopicBindingState[]` -> `actions[]`.
- live renderable-topic selections -> `displays[]`.
- required connection ids -> `connections`.

Do not put React hooks, DOM APIs, or transport instances in these helpers.

Keep `App.tsx` thin:

- It may call these helpers.
- It should not manually inspect `source.messageType` branches inline.
- It should not hand-build scenario `actions[]` / `displays[]` entries inline.
- It should not contain parser-style validation logic.

If `ScenarioVisualizationSync.ts` remains, either rename it to reflect the
broader topic config role or make it delegate to the new dedicated module.

### Phase 3 — App Wiring

Update `src/app/App.tsx` so scenario load applies:

- `actions[]` to live Twist control bindings.
- `displays[]` to live renderable-topic selections.

Remove app wiring that reads:

- `spec.interaction?.ros2TwistControls`
- `spec.visualization?.ros2Topics`

unless `interaction.keyboardControl` remains supported for keyboard-only
settings. Do not confuse keyboard interaction config with ROS 2 action config.

Important: this phase should mostly wire helper outputs into existing app
state. If it requires large inline schema transforms inside `App.tsx`, stop and
move that logic into the dedicated scenario topic config module.

### Phase 4 — Scenario Editor Projection

Update Scenario Editor sync helpers so live UI selections write:

- `connections`
- `actions`
- `displays`

instead of writing:

- `interaction.ros2TwistControls`
- `visualization.ros2Topics`

Rules:

- Preserve unrelated scenario fields.
- Do not overwrite invalid editor JSON while the user is typing.
- Do not add a connection entry unless at least one action/display references it
  or the scenario already declared it.
- Use the active transport config to populate the `rosbridge` connection where
  practical.
- If only rosbridge is supported, use connection id `"rosbridge"` by default.
- Deselecting display topics removes them from `displays`.
- Disabling Twist can either preserve an action with `enabled: false` or remove
  it, but choose one policy and test it. If preserving disabled bindings is
  already the current UX, keep that behavior.

### Phase 5 — Docs and Examples

Update:

- `doc/Architecture.md`
- `doc/Development_Guide.md` if needed
- `doc/Topic_Support_Guide.md`
- `doc/Plugins.md` if display plugin instructions mention old paths
- bundled sample scenarios under `public/scenarios/`
- root/local scenario examples such as `simple-scenario.json` or
  `simple-scenario-new.json` if present
- any Scenario Editor test fixtures or hardcoded JSON strings that still use
  `interaction.ros2TwistControls` or `visualization.ros2Topics`

Update examples to use:

```json
"connections": {
  "rosbridge": {
    "kind": "rosbridge",
    "url": "ws://localhost:9090"
  }
},
"actions": [],
"displays": []
```

## Required Tests

Add or update tests before considering the migration complete.

### Parser Tests

In `ScenarioLoader.test.ts`, cover:

- parses a valid `connections` block with `kind: 'rosbridge'`
- rejects empty connection ids
- rejects unsupported connection kinds
- rejects action/display referencing unknown connection
- parses valid Twist action
- rejects Twist action without `target`
- rejects Twist action with non-vehicle target
- rejects `nav_msgs/msg/Path` in `actions`
- rejects `geometry_msgs/msg/PoseArray` in `actions`
- parses valid Path display
- parses valid PoseArray display
- rejects `geometry_msgs/msg/Twist` in `displays`
- validates display style fields
- validates Twist scale/limits/timeout fields
- rejects legacy `interaction.ros2TwistControls` with a clear error
- rejects legacy `visualization.ros2Topics` with a clear error
- preserves or relocates `interaction.keyboardControl` according to the chosen
  keyboard-control decision, with tests

### Scenario Editor Sync Tests

In `ScenarioVisualizationSync.test.ts` or a renamed/new scenario topic config
test:

- selected Path topic writes a `displays[]` entry
- selected PoseArray topic writes a `displays[]` entry with style fields
- selected Twist control writes an `actions[]` entry with target vehicle
- generated entries include `source.connection`, `source.topic`, and
  `source.messageType`
- generated JSON includes a `connections.rosbridge` entry when needed
- removing all display topics removes or empties `displays` according to chosen
  policy
- disabling Twist preserves/removes action according to chosen policy
- invalid editor JSON is not overwritten
- unrelated scenario fields are preserved
- existing Scenario Editor fixtures that used legacy topic config are migrated
  to `connections/actions/displays`
- `App.tsx` can consume helper output without knowing message-type mapping
  details

### App Wiring Tests

Add/update tests to prove:

- loading a new-schema Twist action creates live `twistControlBindings`
- loading new-schema displays selects renderable topics when capability is
  available
- selecting the rosbridge transport alone creates no action/display
- old `interaction.ros2TwistControls` no longer activates anything because it
  fails parser validation
- old `visualization.ros2Topics` no longer activates anything because it fails
  parser validation

### Communication Lifecycle Tests

Preserve existing guarantees:

- empty Twist bindings create zero `VehicleCommandTopicBridge`s
- disabled Twist action creates no bridge
- toggling a Twist binding starts/stops only Twist bridges
- toggling Twist does not reset topic discovery or reconnect rosbridge
- display topic toggles do not mutate simulation state directly

## Manual Acceptance Criteria

Use the running app to verify:

1. Load a new-schema scenario with no actions/displays.
   - rosbridge selected alone does not move `ego`.
   - Scenario Editor does not invent `/cmd_vel`.

2. Select `/cmd_vel` for `ego`.
   - Scenario Editor writes an `actions[]` entry.
   - `connections.rosbridge` exists.
   - Vehicle follows incoming Twist messages.

3. Deselect `/cmd_vel`.
   - Bridge stops.
   - Vehicle returns to scenario controls or zero according to current policy.
   - Scenario Editor reflects disabled/removed action according to chosen
     policy.
   - rosbridge does not reconnect.

4. Select `/circle_path`.
   - Scenario Editor writes a `displays[]` entry.
   - Path renders.
   - Deselecting removes the rendered path.

5. Select `/pose_array`.
   - Scenario Editor writes a `displays[]` entry.
   - PoseArray renders.
   - Reset clears the rendered artifact state.

6. Download the scenario JSON and reload it.
   - Same actions/displays are restored.

7. Search the repository for legacy topic config.
   - No sample scenario, Scenario Editor fixture, or doc example should still
     use `interaction.ros2TwistControls` or `visualization.ros2Topics` unless
     it is intentionally inside a parser rejection test.

## Files Likely Affected

Do not modify all of these blindly; inspect first.

Likely affected:

- `src/simulation/scenarios/Scenario.ts`
- `src/simulation/scenarios/ScenarioLoader.ts`
- `src/simulation/scenarios/ScenarioLoader.test.ts`
- `src/ui/scenario/ScenarioTopicConfig.ts` or equivalent new dedicated module
- `src/ui/scenario/ScenarioTopicConfig.test.ts` or equivalent tests
- `src/ui/scenario/ScenarioVisualizationSync.ts` only if it remains as a thin
  wrapper/delegator
- `src/ui/scenario/ScenarioVisualizationSync.test.ts` only if that file remains
- `src/app/App.tsx`
- `src/app/CommunicationProvider.tsx` only if binding input shape changes
- `src/app/RenderableTopics.ts` only if selection projection shape changes
- `src/ui/Ros2TopicsPanel.tsx` only if UI props need renaming
- `public/scenarios/*.json`
- root/local `*.json` scenario examples if they exist
- docs listed above

Avoid touching:

- renderer code unless the display artifact contract changes
- `VehicleEntity` unless command semantics intentionally change
- `VehicleCommandSystem` unless the canonical command flow changes
- rosbridge transport internals unless source metadata requires it

## Final Response Requirements

After implementing, report:

1. Files changed.
2. Confirmation that legacy topic config support was removed.
3. New schema support status.
4. Tests added/updated and their results.
5. Architecture compliance summary.
6. Any known migration risks.

Do not claim the migration is complete unless old topic config fails loudly,
new schema scenarios load, the Scenario Editor writes only the new schema, and
all required tests pass.
