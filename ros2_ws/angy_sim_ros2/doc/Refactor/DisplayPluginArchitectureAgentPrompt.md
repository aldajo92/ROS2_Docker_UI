# Display Plugin Architecture Agent Prompt

Use this prompt when migrating the current ROS2 renderable-topic flow into a
transport-agnostic display plugin architecture, and reuse the "Future Plugin
Agent Template" section when adding new display types later.

This prompt assumes `doc/Architecture.md` and `doc/Development_Guide.md` are the
source of truth.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your job is to evolve the project toward an RViz-like display architecture while
preserving the existing boundaries:

- `src/simulation` owns JSON-safe simulator data and deterministic state.
- `src/ui/renderers` read `SimulationState` and render it; renderers are
  read-only.
- `src/infrastructure/communication/<vendor>` owns transport-specific and
  message-format-specific code.
- `src/app` owns UI-facing capabilities and composition glue.
- ROS2 message names and ROS wire shapes must not leak into `src/simulation`,
  `src/math`, renderer objects, or generic display plugins.

The immediate goal is to migrate the existing `nav_msgs/msg/Path` rendering flow
into the first display plugin, without changing user-facing behavior.

The long-term goal is to make future visual support (`Point`, `Pose`,
`PoseArray`, `Marker`, `MarkerArray`, `OccupancyGrid`, `LaserScan`,
`PointCloud2`, etc.) additive through plugins and transport bindings.

---

## Current Behavior To Preserve

The current path rendering pipeline is:

```text
Ros2TopicsPanel
  -> useRenderableTopics()
  -> RenderableTopicCapability
  -> RosbridgeRenderableTopics
  -> RosPathToPath2DAdapter
  -> ExternalPathUpdateQueue
  -> ExternalPathRenderSystem
  -> SimulationState.paths
  -> ThreePathRenderer / PhaserPathRenderer
```

Current user-facing behavior must remain unchanged:

- Discovered `nav_msgs/msg/Path` topics are renderable.
- The topic row checkbox selects/deselects rendering.
- Per-topic `color` and `thickness` remain available.
- Color/thickness apply immediately to an existing rendered path.
- Deselecting and reselecting a topic preserves the per-topic visual config for
  the active session.
- The topic panel remains capability-driven and does not import rosbridge,
  roslib, ROS message types, or simulation internals beyond app-level
  contracts.
- External callbacks do not mutate `SimulationState`; they enqueue updates and
  a `SimulationSystem` applies them during the tick.

---

## Architectural Target

Separate the concept of a visual display from the concept of a ROS2 topic.

```text
Display Plugin
  = internal visual artifact lifecycle
  = transport/message agnostic
  = talks in Path2D, PointMarker2D, VectorField2D, etc.

Transport Binding
  = maps external topic/message types to display plugins
  = transport-specific
  = ROS2 message names live here
```

The target flow for ROS2 path topics is:

```text
Ros2TopicsPanel
  -> generic RenderableTopicCapability
  -> RosbridgeRenderableTopics
  -> RosTopicDisplayBinding resolves "nav_msgs/msg/Path"
  -> PathDisplayPlugin selected by binding
  -> RosPathToPath2DAdapter converts ROS payload to Path2D
  -> PathDisplayPlugin runtime applies visual config
  -> ExternalPathUpdateQueue
  -> ExternalPathRenderSystem
  -> SimulationState.paths
  -> ThreePathRenderer / PhaserPathRenderer
```

Important separation:

- `PathDisplayPlugin` knows how to manage `Path2D`.
- `RosPathToPath2DAdapter` knows how to convert `nav_msgs/msg/Path` into
  `Path2D`.
- `RosTopicDisplayBinding` connects `nav_msgs/msg/Path` to `PathDisplayPlugin`.
- `RosbridgeRenderableTopics` orchestrates selected-topic lifecycle but does
  not hardcode the path adapter directly.

---

## First Implementation Scope

Implement only the plugin architecture necessary to migrate the existing
`nav_msgs/msg/Path` behavior.

Do not add new ROS message support in this first pass.

Do not change renderer behavior except where required by type boundaries.

Do not change the scenario visualization JSON shape except if a small naming or
adapter adjustment is required to keep existing behavior working.

Do not remove existing tests; use them as compatibility tests.

---

## Proposed File Layout

Create generic display contracts under an app/simulation-owned boundary that is
not transport-specific. Prefer `src/app/display/` if the contracts are consumed
mainly by UI-facing capabilities, or `src/simulation/display/` if they model
simulation-owned visual artifacts. Keep transport-specific bindings out of both.

Recommended layout:

```text
src/app/display/
  DisplayPlugin.ts
  DisplayPluginRegistry.ts

src/app/display/plugins/
  PathDisplayPlugin.ts

src/infrastructure/communication/rosbridge/display/
  RosTopicDisplayBinding.ts
  RosTopicDisplayBindings.ts
```

Existing files to keep and reuse:

```text
src/simulation/paths/
  Path2D.ts
  PathPoint2D.ts
  PathRegistry.ts
  ExternalPathUpdateQueue.ts

src/simulation/systems/
  ExternalPathRenderSystem.ts

src/infrastructure/communication/rosbridge/adapters/
  RosPathToPath2DAdapter.ts

src/ui/renderers/three/objects/
  ThreePathRenderer.ts

src/ui/renderers/phaser/objects/
  PhaserPathRenderer.ts
```

---

## Generic Display Contracts

The exact names may be adjusted to match repository style, but the architecture
must preserve these roles.

```ts
export interface DisplayVisualConfig {
  color?: string
  thickness?: number
}

export interface DisplayRuntimeContext {
  // Queues, registries, loggers, or display-specific services needed by a
  // plugin. Keep this free of ROS/rosbridge/roslib types.
}

export interface DisplayPlugin<TArtifact, TConfig extends DisplayVisualConfig> {
  id: string
  label: string
  artifactKind: string
  defaultConfig: TConfig

  applyConfig(artifact: TArtifact, config: TConfig): TArtifact
  enqueueUpsert(artifact: TArtifact, context: DisplayRuntimeContext): void
  enqueueRemove(id: string, context: DisplayRuntimeContext): void
}
```

For the path plugin:

```ts
PathDisplayPlugin
  id: "path2d"
  label: "Path"
  artifactKind: "path2d"
  defaultConfig: { color: "#f0c14a", thickness: 2 }
  applyConfig(path, config) -> Path2D with color/thickness
  enqueueUpsert(path, context) -> ExternalPathUpdateQueue.enqueueUpsert(path)
  enqueueRemove(id, context) -> ExternalPathUpdateQueue.enqueueRemove(id)
```

The plugin must not import ROS types, roslib, rosbridge transport classes, React,
Three.js, Phaser, or DOM APIs.

---

## ROS Binding Contracts

ROS-specific bindings live under `src/infrastructure/communication/rosbridge/`.

```ts
export interface RosTopicDisplayBinding<TArtifact> {
  messageType: string
  displayPluginId: string
  createAdapter(options: {
    artifactId: string
    artifactName?: string
  }): MessageAdapter<unknown, TArtifact>
}
```

For the first implementation:

```ts
{
  messageType: "nav_msgs/msg/Path",
  displayPluginId: "path2d",
  createAdapter: ({ artifactId, artifactName }) =>
    new RosPathToPath2DAdapter({
      pathId: artifactId,
      pathName: artifactName,
    }),
}
```

The ROS binding may import:

- `MessageAdapter`
- `RosPathToPath2DAdapter`
- ROS message type constants/types from rosbridge infrastructure

The ROS binding must not import renderers.

---

## `RenderableTopics` Migration Requirements

Keep `RenderableTopicCapability` as the UI-facing API in this phase.

The capability should evolve from "whitelist of renderable topic kinds" toward
"registry-backed display support".

Current UI-facing concepts may remain:

- `isRenderable(topic)`
- `getUnsupportedReason(topic)`
- `isSelected(topicName)`
- `selectTopic(topic)`
- `deselectTopic(topicName)`
- `selectedTopics`
- `getVisualConfig(topicName)`
- `setVisualConfig(topicName, partialConfig)`

Internally, support lookup should resolve through bindings:

```text
TopicInfo.type
  -> RosTopicDisplayBinding.messageType
  -> displayPluginId
  -> DisplayPlugin
```

The selected-topic snapshot should continue to include enough information for
the existing UI and scenario visualization sync:

```ts
{
  topicName: string
  messageType: string
  kind: string        // existing field may map to display artifactKind
  visualConfig: ...
}
```

If renaming `kind` to `displayPluginId` or `artifactKind` would create broad UI
churn, keep the current shape for now and document the compatibility mapping.

---

## `RosbridgeRenderableTopics` Migration Requirements

Refactor `RosbridgeRenderableTopics` so it delegates message-specific behavior
to the binding + plugin pair.

Responsibilities that remain in `RosbridgeRenderableTopics`:

- Maintain selected-topic lifecycle.
- Subscribe/unsubscribe via the `RenderableSubscriber` abstraction.
- Register runtime topic type via `setTopicType(topic, messageType)`.
- Remember per-topic visual config during the active session.
- Emit snapshots for React state.
- Drop malformed messages without killing the subscription.
- Log first message and throttled receive summaries.
- Clean up active artifacts on deselect/transport teardown.

Responsibilities moved out:

- Direct hardcoding of `RosPathToPath2DAdapter`.
- Direct hardcoding of "if `support.kind === 'path2d'`, then path adapter".
- Direct knowledge that `nav_msgs/msg/Path` is the supported ROS message type.

Expected new flow inside the message handler:

```text
incoming ROS payload
  -> adapter.toInternal(payload)       // returns internal artifact
  -> plugin.applyConfig(artifact, visualConfig)
  -> cache last artifact for immediate visual-config updates
  -> plugin.enqueueUpsert(artifact, context)
```

Expected deselect flow:

```text
deselect topic
  -> unsubscribe
  -> plugin.enqueueRemove(artifactId, context)
  -> emit selected-topic snapshot
```

---

## Replay Contract

Any visual artifact introduced by a display plugin must be able to participate
in playback.

For the first migration, document the current state clearly:

- `Path2D` exists in `SimulationState.paths`.
- `paths` are loaded from scenarios.
- `paths` are rendered live.
- `paths` are not fully persisted/restored in replay yet.

If this implementation touches replay, complete the path replay loop:

```text
SimulationState.paths
  -> SimulationFrameSnapshot.paths?: Path2D[]
  -> createSnapshotFromState()
  -> replay JSON
  -> createReplayStateFromFrame()
  -> SimulationState.paths
  -> renderers
```

If replay is intentionally deferred, add a small doc note or TODO in the prompt
output stating that future display plugins must not be considered complete until
their artifacts are snapshot/restored.

For future plugins, replay is mandatory from the first implementation.

---

## Tests Required

Preserve existing tests and add focused tests for the new boundaries.

Required test categories:

1. **Display plugin tests**
   - `PathDisplayPlugin.applyConfig` applies color/thickness.
   - `PathDisplayPlugin.enqueueUpsert` writes to `ExternalPathUpdateQueue`.
   - `PathDisplayPlugin.enqueueRemove` enqueues remove by id.
   - Plugin does not depend on ROS/rosbridge modules.

2. **ROS binding tests**
   - `nav_msgs/msg/Path` resolves to `path2d`.
   - Binding creates `RosPathToPath2DAdapter`.
   - Unknown message type is unsupported.

3. **Renderable capability tests**
   - `isRenderable` returns true for any topic with `nav_msgs/msg/Path`.
   - Select subscribes and emits a snapshot identical to current behavior.
   - Deselect unsubscribes and removes the artifact.
   - Color/thickness still apply immediately to the cached last artifact.
   - Deselect/reselect preserves remembered visual config.
   - Malformed message is dropped and subscription remains alive.

4. **Architecture tests**
   - No ROS message strings/imports in generic display plugins.
   - No `roslib` imports outside rosbridge infrastructure.
   - No renderer imports in display plugin contracts.
   - No infrastructure imports in `src/simulation`.

5. **Regression tests**
   - Existing `RosbridgeRenderableTopics.test.ts` behavior remains green.
   - Existing `RenderableTopics.test.ts` behavior remains green.
   - Existing scenario visualization sync tests remain green.

---

## Verification Commands

Run the repo's existing checks. Prefer project scripts when available.

```bash
npm test
npx eslint src/app src/infrastructure/communication/rosbridge src/simulation src/ui
npx tsc -b --noEmit
```

If `tsc` fails on pre-existing unrelated errors, report those exact files and
confirm the new/modified files do not introduce additional TypeScript errors.

---

## Documentation Updates

Update docs when the migration is implemented:

- `doc/Architecture.md`
  - Replace the current `RenderableTopics` explanation with the
    display-plugin/binding split.
  - State explicitly that display plugins are internal-artifact plugins, not ROS
    message plugins.
  - State that transport-specific message bindings live under
    `src/infrastructure/communication/<vendor>/`.

- `doc/Development_Guide.md`
  - Add a rule: new renderable topic support must add an internal artifact
    plugin plus a transport binding.
  - Add a rule: new visual artifacts must include replay snapshot/restore unless
    explicitly deferred and documented.

---

## Acceptance Criteria For First Migration

The first migration is complete when:

- The user can still render `nav_msgs/msg/Path` topics from the ROS2 topic list.
- Color and thickness still update the rendered path immediately.
- Deselect/reselect still keeps the selected visual config.
- `RosbridgeRenderableTopics` no longer hardcodes `RosPathToPath2DAdapter`
  directly in the selection handler.
- `PathDisplayPlugin` has no ROS/rosbridge/roslib imports.
- ROS-specific message type resolution lives under rosbridge infrastructure.
- Existing tests pass, plus new plugin/binding tests.
- The architecture docs explain how to add the next display plugin.

---

# Future Plugin Agent Template

Use this section as the prompt for every future display plugin.

## Plugin Request

Implement a new display plugin for:

```text
Display artifact: <PointMarker2D | VectorField2D | OccupancyGrid2D | ...>
Transport binding: <ROS2 message type or other external source>
Renderer support: <Three | Phaser | both>
Scenario support: <yes/no>
Replay support: <yes/no, default yes>
```

## Agent Requirements

1. Define or reuse a JSON-safe internal artifact type under `src/simulation`.
2. Add a registry to `SimulationState` when the artifact is stateful.
3. Add scenario parsing only when the artifact can be declared by scenario JSON.
4. Add replay snapshot/restore unless explicitly deferred.
5. Add renderer implementations that read only `SimulationState`.
6. Add a display plugin that handles the internal artifact lifecycle.
7. Add transport-specific binding/adapters under
   `src/infrastructure/communication/<vendor>/`.
8. Keep UI panels capability-driven and free of transport-specific imports.
9. Add tests for:
   - artifact registry
   - scenario parsing if applicable
   - replay snapshot/restore
   - display plugin lifecycle
   - transport binding/adapters
   - renderer behavior where practical
   - architecture boundaries

## Boundary Checklist

Before finishing, confirm:

- `src/simulation` does not import ROS, roslib, WebSocket, React, Three.js,
  Phaser, DOM APIs, or infrastructure modules.
- Generic display plugins do not import ROS/rosbridge/roslib.
- Transport bindings do not import renderer objects.
- Renderers do not mutate `SimulationState`.
- External callbacks enqueue updates; they do not write directly to state.
- Replay can reproduce the visible artifact.

## Output Expected From The Agent

When done, report:

- New artifact type and where it lives.
- New plugin and binding files.
- New renderer support.
- Scenario and replay support status.
- Tests added/updated.
- Any deferred work and why.

