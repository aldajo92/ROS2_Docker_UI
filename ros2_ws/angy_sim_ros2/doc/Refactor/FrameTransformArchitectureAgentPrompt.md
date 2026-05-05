# Frame Transform / TF Architecture Agent Prompt

Use this prompt when adding frame-transform support to `angy_sim_ros2`.

This prompt assumes:

- `doc/Architecture.md` and `doc/Development_Guide.md` are the source of truth.
- `doc/Plugins.md` defines the current display plugin architecture.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to introduce a transport-agnostic frame-transform capability that
can later be fed by ROS2 `/tf` and `/tf_static`, while keeping renderers and
simulation core free of ROS-specific concepts.

Frame transforms are not a normal display plugin. They are shared
infrastructure used by display plugins to normalize visual artifacts into a
fixed frame before those artifacts are written into `SimulationState`.

---

## Objective

Add a first version of frame-transform support with these goals:

1. Define internal JSON-safe transform types.
2. Provide a frame-transform registry/service that can resolve transforms
   between frames.
3. Add a fixed-frame concept.
4. Keep ROS2 TF messages isolated in rosbridge infrastructure adapters.
5. Let display plugins transform artifacts from `artifact.frameId` to the
   current fixed frame before enqueueing them into simulation state.
6. Keep renderers simple: renderers read only normalized simulation coordinates.
7. Preserve replay compatibility and establish how transforms participate in
   recording/playback.

---

## Architecture Constraints

Follow these rules strictly:

- No ROS2 message types, `/tf`, `/tf_static`, `tf2_msgs`, `geometry_msgs`, or
  roslib imports in `src/simulation`, `src/math`, generic display plugins, or
  renderers.
- No Three.js, Phaser, React, DOM APIs, rosbridge, or infrastructure imports in
  `src/simulation/frames`.
- Renderers must not perform TF lookups.
- External callbacks must not mutate `SimulationState` directly.
- Transform updates from a transport must go through a queue/system handoff, the
  same way external paths currently go through `ExternalPathUpdateQueue` and
  `ExternalPathRenderSystem`.
- The frame system must be usable by non-ROS transports in the future.

---

## Terminology

- **Frame**: Named coordinate frame, e.g. `map`, `world`, `odom`,
  `base_link`.
- **Fixed frame**: The target frame used for rendering, analogous to RViz's
  fixed frame. Initial default should be `map` or `world`; choose the one that
  best matches existing project conventions and document it.
- **Source frame**: The `frameId` carried by a visual artifact.
- **Transform**: Relationship from `parentFrameId` to `childFrameId`.
- **Normalized artifact**: A display artifact whose coordinates have already
  been transformed into the fixed frame before entering `SimulationState`.

---

## Initial Scope

Implement 2D frame transforms first.

The simulator is currently a 2D simulation rendered in Phaser and Three.js.
Start with:

```ts
export interface FrameTransform2D {
  parentFrameId: string
  childFrameId: string
  timeSec?: number
  translation: { x: number; y: number }
  yaw: number
  static?: boolean
}
```

Use simulation coordinates:

- `x` in meters
- `y` in meters
- `yaw` in radians

Do not implement 3D math in the first pass unless required by existing code.
The ROS adapter may project a 3D ROS transform into 2D by using:

- `translation.x`
- `translation.y`
- yaw extracted from quaternion rotation

Document that roll, pitch, and z are ignored in the first 2D version.

---

## Proposed File Layout

Internal frame system:

```text
src/simulation/frames/
  FrameTransform2D.ts
  FrameTransformRegistry.ts
  FrameTransformService.ts
  ExternalFrameTransformUpdateQueue.ts
```

Simulation system:

```text
src/simulation/systems/
  ExternalFrameTransformSystem.ts
```

ROS-specific adapter/binding:

```text
src/infrastructure/communication/rosbridge/adapters/
  RosTfMessageToFrameTransformsAdapter.ts

src/infrastructure/communication/rosbridge/display/
  RosFrameTransformBinding.ts
```

App/composition support, if needed:

```text
src/app/
  FrameTransformConfig.ts
  useFrameTransformStatus.ts
```

Keep file names aligned with existing project style if better names already
exist.

---

## Internal Service Contract

Define an internal service shaped approximately like this:

```ts
export interface FrameTransformService {
  getFixedFrame(): string
  setFixedFrame(frameId: string): void

  upsert(transform: FrameTransform2D): void
  remove(parentFrameId: string, childFrameId: string): void
  clear(): void

  lookupTransform(
    sourceFrameId: string,
    targetFrameId?: string,
    timeSec?: number,
  ): FrameTransform2D | undefined

  transformPoint2D(
    point: { x: number; y: number },
    sourceFrameId?: string,
    targetFrameId?: string,
    timeSec?: number,
  ): { x: number; y: number } | undefined

  transformYaw(
    yaw: number | undefined,
    sourceFrameId?: string,
    targetFrameId?: string,
    timeSec?: number,
  ): number | undefined
}
```

Policy:

- Missing `sourceFrameId` means the point is already in the fixed frame.
- `sourceFrameId === targetFrameId` means identity transform.
- Missing transform returns `undefined`.
- Do not silently invent transforms between unrelated frames.
- Static transforms are valid for all times.
- Dynamic transforms may initially ignore `timeSec` and use the latest value per
  edge; document this limitation clearly.

---

## Registry Behavior

`FrameTransformRegistry` should store transforms by `(parentFrameId,
childFrameId)`.

Minimum behavior:

- `upsert(transform)`
- `remove(parentFrameId, childFrameId)`
- `get(parentFrameId, childFrameId)`
- `toArray()`
- `clear()`
- `size()`

Lookup should support:

- identity source/target
- direct parent -> child
- inverse child -> parent
- simple multi-hop paths if practical in first pass

If multi-hop graph traversal is deferred, document it and implement direct +
inverse only. For RViz-like behavior, multi-hop traversal is the long-term
target.

---

## External Transform Queue

Follow the same principle as external paths:

```text
transport callback
  -> adapter creates FrameTransform2D[]
  -> ExternalFrameTransformUpdateQueue.enqueueUpsert(...)
  -> ExternalFrameTransformSystem.update(...)
  -> FrameTransformRegistry / FrameTransformService
```

The queue should coalesce by `(parentFrameId, childFrameId)`, keeping the latest
transform per edge between ticks.

---

## ROS2 `/tf` and `/tf_static` Adapter

Add a ROS-specific adapter under rosbridge infrastructure.

Input shape:

```text
tf2_msgs/msg/TFMessage
  transforms: TransformStamped[]

TransformStamped
  header.frame_id
  header.stamp
  child_frame_id
  transform.translation.x/y/z
  transform.rotation.x/y/z/w
```

Output:

```ts
FrameTransform2D[]
```

Mapping:

- `parentFrameId = header.frame_id`
- `childFrameId = child_frame_id`
- `timeSec = header.stamp.sec + header.stamp.nanosec / 1e9` when present
- `translation.x = transform.translation.x`
- `translation.y = transform.translation.y`
- `yaw = quaternionToYaw(transform.rotation)`
- `static = true` for `/tf_static` binding
- `static = false` or omitted for `/tf` binding

Validation:

- `parentFrameId` and `childFrameId` must be non-empty strings.
- Translation x/y must be finite numbers.
- Quaternion fields must be finite numbers.
- Malformed transforms should be dropped individually where possible; one bad
  transform should not drop the whole TF message unless the whole payload shape
  is invalid.

---

## Display Plugin Integration

Display plugins should receive access to the `FrameTransformService` through
their runtime context.

Preferred flow:

```text
external message
  -> transport adapter creates internal artifact in source frame
  -> display runtime reads artifact.frameId
  -> FrameTransformService transforms artifact to fixed frame
  -> display plugin enqueues normalized artifact into SimulationState
```

For `Path2D`:

```text
Path2D.frameId = "odom"
fixedFrame = "map"
lookup odom -> map
transform every point into map
set Path2D.frameId = "map"
enqueue into ExternalPathUpdateQueue
```

For future `PointMarker2D`:

```text
PointMarker2D.frameId = "base_link"
fixedFrame = "map"
transform x/y into map
set frameId = "map"
enqueue into ExternalPointMarkerUpdateQueue
```

If transform lookup fails:

- Do not enqueue a newly transformed artifact.
- Preserve existing artifact if that is the least surprising UI behavior.
- Expose display status as `missing_transform` or similar so the UI can show
  why the topic is selected but not updating.

---

## UI Requirements

Add fixed-frame awareness in UI only after the internal service exists.

Minimum UI:

```text
Renderer / Display Settings
  Fixed Frame: [map]
```

Future UI:

- fixed-frame selector populated from known frames
- TF status card
- frame tree debug view
- per-display status:
  - `ok`
  - `missing_transform`
  - `stale_transform`
  - `invalid_frame`

The `Ros2TopicsPanel` should not directly perform transform lookups.

---

## Replay Contract

Frame transforms affect what the user sees, so replay must be considered.

Acceptable first-pass policy:

1. Display artifacts are recorded after being transformed into the fixed frame.
2. Replay reproduces the visible output without recalculating TF.
3. The frame transform graph itself may be omitted from replay initially if it
   is not needed to reproduce the visible frame.

Long-term replay policy:

```ts
interface SimulationFrameSnapshot {
  frameTransforms?: FrameTransform2D[]
  fixedFrame?: string
}
```

When implemented:

- `createSnapshotFromState` snapshots transforms from the frame registry.
- `createReplayStateFromFrame` restores transforms.
- Display artifacts and transforms remain JSON-safe.
- Old replay files without transform fields still load.

If transform replay is deferred, document the limitation in the implementation
summary and tests.

---

## Scenario Contract

Do not require scenario transform support in the first pass unless needed.

Future optional shape:

```ts
frameTransforms?: Array<{
  parentFrameId: string
  childFrameId: string
  translation: { x: number; y: number }
  yaw: number
  static?: boolean
}>
```

This would let scenario JSON declare static frames, such as:

```json
{
  "frameTransforms": [
    {
      "parentFrameId": "map",
      "childFrameId": "odom",
      "translation": { "x": 0, "y": 0 },
      "yaw": 0,
      "static": true
    }
  ]
}
```

Keep this optional and backward compatible.

---

## Tests Required

Add focused tests for:

1. `FrameTransformRegistry`
   - add/update/remove
   - identity lookup
   - direct lookup
   - inverse lookup
   - multi-hop lookup if implemented
   - clear/toArray/size

2. Transform math
   - point translation
   - point rotation by yaw
   - inverse transform
   - yaw transform

3. `ExternalFrameTransformUpdateQueue`
   - coalesces by parent/child edge
   - remove supersedes upsert if remove is supported
   - drain clears pending updates

4. `ExternalFrameTransformSystem`
   - drains queue during tick
   - updates service/registry
   - does not mutate state outside `update`

5. ROS adapter
   - parses valid `tf2_msgs/msg/TFMessage`
   - extracts parent/child frame IDs
   - extracts stamp
   - extracts x/y/yaw
   - marks `/tf_static` transforms static
   - drops malformed individual transforms safely

6. Display integration
   - path/point artifact in fixed frame enqueues unchanged
   - artifact in different frame is transformed before enqueue
   - missing transform does not enqueue stale transformed data
   - status indicates missing transform if status support exists

7. Architecture tests
   - `src/simulation/frames` imports no ROS/rosbridge/roblib/UI/renderer code.
   - ROS TF adapter lives under rosbridge infrastructure.
   - renderers do not import frame transform service.

---

## Verification

Run existing project checks:

```bash
npm test
npx eslint src/simulation src/app src/infrastructure/communication/rosbridge src/ui
npx tsc -b --noEmit
```

If `tsc` has pre-existing unrelated failures, report those files and confirm the
new transform files do not introduce additional errors.

---

## Acceptance Criteria

This work is complete when:

- The project has an internal frame-transform model independent of ROS.
- ROS2 `/tf` and `/tf_static` can be adapted into the internal model without
  leaking ROS types outside rosbridge infrastructure.
- A fixed frame exists and can be read by display runtimes.
- Display artifacts can be normalized into fixed-frame coordinates before
  entering `SimulationState`.
- Renderers remain unaware of TF.
- External transform updates are applied during simulation ticks, not directly
  from transport callbacks.
- Tests cover transform math, adapter behavior, queue/system handoff, and
  architecture boundaries.
- Replay and scenario support decisions are documented, even if deferred.

---

## Future Work

After the first 2D transform implementation:

- Add multi-hop frame graph lookup if not implemented initially.
- Add time-aware transform interpolation.
- Add fixed-frame selector UI.
- Add TF status/debug panel.
- Add scenario-declared static transforms.
- Persist transforms in replay when needed for full RViz-like playback.
- Extend to 3D transforms if supporting full `PointCloud2`, meshes, cameras, or
  3D markers requires it.

