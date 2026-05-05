# Display Plugins

This document describes the display plugin architecture introduced in `angy_sim_ros2`,
the list of currently supported ROS 2 topics, and the step-by-step recipe for adding
the next display type.

Read together with `Architecture.md` (Layer 8 — external communication) and
`Development_Guide.md`.

---

## What is a display plugin?

A **display plugin** is a transport-agnostic object that owns the visual lifecycle of
one internal simulator artifact kind (`Path2D`, `PointMarker2D`, …).

A **ROS topic display binding** maps one ROS 2 message type to a display plugin.

The two roles are always kept separate:

```text
RosTopicDisplayBinding          DisplayPlugin
  messageType (ROS string)  →     id (artifact kind)
  createAdapter()           →     applyConfig()
                                  enqueueUpsert()
                                  enqueueRemove()
```

The binding knows about ROS wire formats. The plugin knows about simulator artifacts.
Neither knows about the other's internals.

---

## Architecture map

```text
Ros2TopicsPanel
  └─ useRenderableTopics()
       └─ RenderableTopicCapability          (src/app/RenderableTopics.ts)
            └─ RosbridgeRenderableTopics     (src/infrastructure/…/rosbridge/)
                 │
                 ├─ findRosTopicDisplayBinding(messageType)
                 │    └─ RosTopicDisplayBindings.ts  ← ROS wire knowledge lives here
                 │         └─ createAdapter()
                 │              └─ RosPathToPath2DAdapter (or future adapter)
                 │
                 ├─ DisplayPluginRegistry.get(displayPluginId)
                 │    └─ DisplayPlugin              ← artifact lifecycle lives here
                 │         ├─ applyConfig()
                 │         ├─ enqueueUpsert()  → ExternalPathUpdateQueue
                 │         └─ enqueueRemove()  → ExternalPathUpdateQueue
                 │
                 └─ ExternalPathRenderSystem (drains queue during tick)
                      └─ SimulationState.paths
                           └─ ThreePathRenderer / PhaserPathRenderer
```

---

## Supported plugins

### `path2d` — Nav Path

| Property | Value |
|---|---|
| **Plugin id** | `path2d` |
| **Plugin file** | `src/app/display/plugins/PathDisplayPlugin.ts` |
| **ROS 2 message type** | `nav_msgs/msg/Path` |
| **Binding file** | `src/infrastructure/communication/rosbridge/display/RosTopicDisplayBindings.ts` |
| **Adapter** | `src/infrastructure/communication/rosbridge/adapters/RosPathToPath2DAdapter.ts` |
| **Internal artifact** | `Path2D` (`src/simulation/paths/Path2D.ts`) |
| **Simulation queue** | `ExternalPathUpdateQueue` |
| **Simulation system** | `ExternalPathRenderSystem` |
| **Renderers** | `ThreePathRenderer`, `PhaserPathRenderer` |
| **Replay support** | Partial — paths live in `state.paths` but are not yet snapshot/restored |

#### Visual config

| Field | Type | Default | Description |
|---|---|---|---|
| `color` | `string` (CSS hex) | `#f0c14a` | Line color |
| `thickness` | `number` | `2` | Line thickness in renderer-specific units |

#### What happens end-to-end

1. Topic discovery finds a topic with type `nav_msgs/msg/Path`.
2. The user checks the topic in `Ros2TopicsPanel`.
3. `RosbridgeRenderableTopics.selectTopic()` looks up the `nav_msgs/msg/Path` binding.
4. The binding creates a `RosPathToPath2DAdapter` keyed to the topic name.
5. On each incoming ROS message the adapter converts it to a `Path2D`.
6. `pathDisplayPlugin.applyConfig()` stamps color + thickness onto the artifact.
7. `pathDisplayPlugin.enqueueUpsert()` pushes the artifact into `ExternalPathUpdateQueue`.
8. During the next engine tick `ExternalPathRenderSystem` drains the queue into `state.paths`.
9. `ThreePathRenderer` / `PhaserPathRenderer` reads `state.paths` and draws the line.
10. Unchecking the topic calls `enqueueRemove()`, which removes the path from `state.paths`
    on the next tick.

---

## Adding the next plugin

Follow these steps in order. Each step references the files to create or edit.

### Step 1 — Define the internal artifact type

Create a JSON-safe type under `src/simulation/`. It must contain no ROS types,
no renderer types, no React types.

```ts
// src/simulation/<artifact>/MyArtifact2D.ts
export type MyArtifact2D = {
  id: string
  // … artifact-specific fields …
}
```

If the artifact is stateful (persists across ticks), add a registry:

```ts
// src/simulation/<artifact>/MyArtifact2DRegistry.ts
export class MyArtifact2DRegistry {
  private readonly items = new Map<string, MyArtifact2D>()
  upsert(artifact: MyArtifact2D): void { … }
  remove(id: string): void { … }
  getAll(): MyArtifact2D[] { … }
}
```

And expose it on `SimulationState`:

```ts
// src/simulation/core/SimulationState.ts  (edit)
myArtifacts: MyArtifact2DRegistry
```

### Step 2 — Add a simulation queue and system

Model the external → simulation handoff as a queue (same pattern as
`ExternalPathUpdateQueue`):

```ts
// src/simulation/<artifact>/ExternalMyArtifactUpdateQueue.ts
export class ExternalMyArtifactUpdateQueue {
  enqueueUpsert(artifact: MyArtifact2D): void { … }
  enqueueRemove(id: string): void { … }
  drain(): ExternalMyArtifactUpdate[] { … }
}
```

Add a system that drains the queue during the tick:

```ts
// src/simulation/systems/ExternalMyArtifactRenderSystem.ts
export class ExternalMyArtifactRenderSystem implements SimulationSystem {
  update(_dt: number, state: SimulationState): void {
    for (const op of this.queue.drain()) {
      if (op.kind === 'upsert') state.myArtifacts.upsert(op.artifact)
      else state.myArtifacts.remove(op.id)
    }
  }
}
```

Register it in `SimulationProvider.tsx`:

```ts
engine.registerSystem(new ExternalMyArtifactRenderSystem(myArtifactQueue))
```

### Step 3 — Extend `DisplayRuntimeContext`

Add the new queue to the shared context so the plugin can reach it:

```ts
// src/app/display/DisplayPlugin.ts  (edit)
export interface DisplayRuntimeContext {
  pathQueue: ExternalPathUpdateQueue
  myArtifactQueue: ExternalMyArtifactUpdateQueue   // ← add
}
```

Update the context construction in `RosbridgeRenderableTopics` constructor:

```ts
this.context = { pathQueue: queue, myArtifactQueue: myArtifactQueue }
```

### Step 4 — Create the display plugin

```ts
// src/app/display/plugins/MyArtifactDisplayPlugin.ts
import type { MyArtifact2D } from '../../../simulation/<artifact>/MyArtifact2D'
import type { DisplayPlugin, DisplayRuntimeContext, DisplayVisualConfig } from '../DisplayPlugin'

export interface MyArtifactVisualConfig extends DisplayVisualConfig {
  color: string
  // … add artifact-specific visual fields …
}

export const myArtifactDisplayPlugin: DisplayPlugin<MyArtifact2D, MyArtifactVisualConfig> = {
  id: 'my-artifact-2d',
  label: 'My Artifact',
  artifactKind: 'my-artifact-2d',
  defaultConfig: { color: '#ffffff' },

  applyConfig(artifact, config) {
    return { ...artifact, color: config.color }
  },

  enqueueUpsert(artifact, context) {
    context.myArtifactQueue.enqueueUpsert(artifact)
  },

  enqueueRemove(id, context) {
    context.myArtifactQueue.enqueueRemove(id)
  },
}
```

**Boundary rule:** this file must not import `roslib`, `rosbridge`, `three`, `phaser`,
or `react`. The architecture test in `architecture.display.test.ts` will catch violations.

**Visual-config round-trip rule:** every field exposed by the plugin UI must round-trip
through the scenario JSON editor and scenario loader. When adding a visual field
such as `thickness`, `arrowSize`, `markerScale`, or `opacity`, update all of the
following paths in the same PR:

- The plugin's `defaultConfig`.
- The artifact type if the renderer needs to read the styled value from
  `SimulationState`.
- The plugin's `applyConfig()` implementation.
- `ScenarioVisualizationTopicStyle` in `src/simulation/scenarios/Scenario.ts`.
- `ScenarioLoader.parse()` validation for `visualization.ros2Topics[].style`.
- The scenario visualization projection helper in
  `src/ui/scenario/ScenarioVisualizationSync.ts`, so live UI edits are written
  back into the Scenario Editor JSON.
- The scenario-load apply path in `App.tsx`, so scenario-declared style fields
  are applied back into `RenderableTopicCapability`.

This prevents a field from working at render time but disappearing from the
editor JSON, which previously happened for PoseArray `arrowSize`.

### Step 5 — Register the plugin

```ts
// src/app/display/DisplayPluginRegistry.ts  (edit)
import { myArtifactDisplayPlugin } from './plugins/MyArtifactDisplayPlugin'

defaultDisplayPluginRegistry.register(myArtifactDisplayPlugin)
```

### Step 6 — Write the ROS adapter

```ts
// src/infrastructure/communication/rosbridge/adapters/RosMyMsgToMyArtifact2DAdapter.ts
import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'
import type { MyArtifact2D } from '../../../../simulation/<artifact>/MyArtifact2D'

export class RosMyMsgToMyArtifact2DAdapter implements MessageAdapter<unknown, MyArtifact2D> {
  constructor(private readonly artifactId: string) {}

  toInternal(message: unknown): MyArtifact2D {
    // validate + convert ROS wire format → MyArtifact2D
  }

  fromInternal(): never {
    throw new Error('not implemented')
  }
}
```

### Step 7 — Register the ROS binding

```ts
// src/infrastructure/communication/rosbridge/display/RosTopicDisplayBindings.ts  (edit)
import { RosMyMsgToMyArtifact2DAdapter } from '../adapters/RosMyMsgToMyArtifact2DAdapter'

const myArtifactBinding: RosTopicDisplayBinding<MyArtifact2D> = {
  messageType: 'my_msgs/msg/MyMsg',
  displayPluginId: 'my-artifact-2d',
  createAdapter: ({ artifactId }) => new RosMyMsgToMyArtifact2DAdapter(artifactId),
}

export const ROS_TOPIC_DISPLAY_BINDINGS = Object.freeze([
  pathBinding,
  myArtifactBinding as RosTopicDisplayBinding<unknown>,  // ← add
])
```

### Step 8 — Add the whitelist entry

```ts
// src/app/RenderableTopics.ts  (edit)
export const RENDERABLE_TOPIC_WHITELIST = Object.freeze([
  { messageType: 'nav_msgs/msg/Path',    kind: 'path2d'          },
  { messageType: 'my_msgs/msg/MyMsg',    kind: 'my-artifact-2d'  },  // ← add
])
```

### Step 9 — Add renderer support

Each renderer reads from `SimulationState` during its render pass. Add a sub-renderer for
each renderer backend you want to support:

```ts
// src/ui/renderers/three/objects/ThreeMyArtifactRenderer.ts
// src/ui/renderers/phaser/objects/PhaserMyArtifactRenderer.ts
```

Register them in `ThreeSimulationRenderer` / `PhaserSimulationRenderer`.

**Renderer rule:** renderers read `state` — they never write to it, never call queues,
and never import rosbridge or roslib.

**Three.js coordinate rule:** all simulation-frame data (positions, yaw, paths, pose arrays)
must go through `src/ui/renderers/three/mapping/ThreeSimTransform.ts`. The mapping module
`simToThree.ts` is the single source of truth for the formula; `ThreeSimTransform.ts` is the
preferred call site for renderer code.

```ts
import {
  setSimPosition2D,
  setSimPose2D,
  setSimYaw,
  simPolyline2DToThreePositions,
  simSegment2DToThreePoints,
} from '../mapping/ThreeSimTransform'
```

| Need | Helper |
|---|---|
| Place object at sim (x, y) | `setSimPosition2D(obj, point, height)` |
| Set yaw on an object | `setSimYaw(obj, yaw)` |
| Both position + yaw | `setSimPose2D(obj, pose, height)` |
| Path / trajectory positions | `simPolyline2DToThreePositions(points, height)` |
| Two-endpoint segment | `simSegment2DToThreePoints(start, end, height)` |

Never write `.position.set(simX, simY, z)` or `.rotation.set(0, 0, simYaw)` from
simulation values. The documented mapping is:

```text
sim.x -> three.x
sim.y -> -three.z
sim.z -> three.y
yaw   -> rotation.y
```

Raw `THREE.Vector3(...)` and direct `position.set(...)` are acceptable only for
Three-native data: local mesh geometry, local basis vectors, lights, or camera internals.
Add a short comment when using raw Three.js coordinates to explain they are local/Three-space.

### Step 10 — Add replay support

Extend `SimulationFrameSnapshot` and the snapshot/restore helpers:

```ts
// src/simulation/recording/SimulationFrameSnapshot.ts  (edit)
myArtifacts?: MyArtifact2D[]

// src/simulation/recording/createSnapshotFromState.ts  (edit)
myArtifacts: state.myArtifacts.getAll()

// src/simulation/recording/createReplayStateFromFrame.ts  (edit)
for (const a of frame.myArtifacts ?? []) state.myArtifacts.upsert(a)
```

### Step 11 — Write tests

Required test categories (mirror the existing `path2d` tests as a template):

| Category | File |
|---|---|
| Artifact registry | `src/simulation/<artifact>/MyArtifact2DRegistry.test.ts` |
| Simulation queue | `ExternalMyArtifactUpdateQueue.test.ts` |
| ROS adapter | `RosMyMsgToMyArtifact2DAdapter.test.ts` |
| Display plugin | `MyArtifactDisplayPlugin.test.ts` |
| ROS binding | `RosTopicDisplayBindings.test.ts` (extend existing) |
| Replay snapshot | `createSnapshotFromState.test.ts` (extend existing) |
| Architecture boundary | `architecture.display.test.ts` catches violations automatically |
| Scenario style parse | `ScenarioLoader.test.ts` validates every `style` field |
| Scenario editor sync | `ScenarioVisualizationSync.test.ts` verifies UI style edits serialize into `visualization.ros2Topics[].style` |

For every visual-config field exposed by the plugin UI, add tests for both
directions of the scenario round-trip:

- [ ] Loading scenario JSON applies `visualization.ros2Topics[].style.<field>` to
      the live selected topic config.
- [ ] Editing the UI control writes `<field>` back into the Scenario Editor JSON.
- [ ] Defaults are omitted from JSON only when they truly match the plugin's own
      defaults, not another plugin's defaults.
- [ ] Invalid values are rejected by `ScenarioLoader.parse()` with a clear error.

If the plugin adds a Three.js renderer for simulation geometry, also add mapping
tests that prove the renderer respects `simToThree.ts`:

- [ ] 2D sim points map to `(x, height, -y)` via `simPoint2DToThree(...)`.
- [ ] 3D sim points map to `(x, z, -y)` via `simPoint3DToThree(...)`.
- [ ] Sim yaw drives `rotation.y` via `simYawToThreeRotationY(...)`, not `rotation.z`.
- [ ] Trajectories, paths, pose arrays, arrows, vectors, and outlines render on the
      horizontal Three.js ground plane unless the artifact explicitly represents 3D data.
- [ ] Any raw `THREE.Vector3(...)`, `.position.set(...)`, or direct rotation assignment
      in the renderer is either removed or covered by a comment explaining why it is
      local/Three-space rather than simulation-frame data.

### Step 12 — Verify

```bash
npm test
npx tsc -b --noEmit
npx eslint src/app/display src/infrastructure/communication/rosbridge/display src/simulation
```

---

## Boundary checklist

Before opening a PR for a new plugin, confirm:

- [ ] `src/simulation/` does not import `roslib`, `rosbridge`, `react`, `three`, or `phaser`.
- [ ] The display plugin does not import `roslib`, `rosbridge`, `three`, or `phaser`.
- [ ] The ROS binding does not import renderer modules.
- [ ] Renderers do not mutate `SimulationState`.
- [ ] Three.js renderers convert simulation coordinates only through
      `src/ui/renderers/three/mapping/simToThree.ts`.
- [ ] Every plugin visual-config field exposed in the UI is represented in
      scenario style parsing, scenario-load application, editor JSON sync, and
      tests.
- [ ] External callbacks enqueue updates; they do not write directly to state.
- [ ] Replay can reproduce the rendered artifact (`SimulationFrameSnapshot` extended).
- [ ] All existing tests still pass.

---

## Replay status per plugin

| Plugin | Artifact in `state` | Snapshot | Restore | Status |
|---|---|---|---|---|
| `path2d` | `state.paths` | No | No | Deferred — paths are live-only today |

> **Rule:** future plugins must include replay support from the first implementation.
> A plugin is not considered complete until its artifact is snapshot and restored.
