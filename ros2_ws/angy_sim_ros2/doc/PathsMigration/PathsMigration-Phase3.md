## Prompt 3: migrar renderer e Inspector para usar `state.trajectories`

```text
I want to implement Phase 3 of generic trajectory tracking in `angy_sim_ros2`.

Context:
- Phase 1 created the generic trajectory model and registry.
- Phase 2 integrated:
  - `state.trajectories`
  - `TrajectoryTrackingSystem`
  - scenario `trajectoryTracking` config
  - engine/controller clearing APIs
- The current Three.js trail renderer still owns its own sampled trail buffers.
- I now want to migrate the renderer and Inspector to use simulation-owned trajectories.

Goal:
Migrate from renderer-owned vehicle trails to simulation-owned generic entity trajectories.

New source of truth:
- `state.trajectories`

Renderer role:
- read `state.trajectories`
- draw trajectories
- keep only GPU/render-object caches
- never append trajectory samples
- never mutate `state.trajectories`

Architecture rules:
- Renderers are read-only consumers of `SimulationState`.
- Do not mutate entities from the renderer.
- Do not mutate `state.trajectories` from the renderer.
- Do not import Three.js into `src/simulation` or `src/math`.
- Do not compute trajectory sampling in the renderer.
- Sampling belongs only to `TrajectoryTrackingSystem`.
- Clearing source-of-truth trajectories must go through `SimulationController` or `SimulationEngine`.

Files to update/create:

src/ui/renderers/three/objects/ThreeTrajectoryRenderer.ts
src/ui/renderers/three/core/ThreeSimulationRenderer.ts
src/ui/renderers/three/config/ThreeRendererConfig.ts
src/ui/viewport/ThreeSimulationViewport.tsx
Inspector controls for trajectory tracking and visualization
Any old ThreeTrailRenderer usage

1. Replace renderer-owned trail sampling

Current behavior to remove:
- Renderer stores trail samples as source of truth.
- Renderer appends vehicle position during `sync(state)`.
- Renderer decides sampling mode, max points, time windows, min distance.

New behavior:
- `TrajectoryTrackingSystem` handles sampling.
- `state.trajectories` stores samples.
- Renderer only draws samples from `state.trajectories`.

After migration, there must be only one source of truth for actual trajectories:

```text
state.trajectories
````

Renderer-side storage is allowed only for:

* THREE.Line objects
* geometries
* materials
* render cache keyed by entityId

2. Create `ThreeTrajectoryRenderer`

Create:

src/ui/renderers/three/objects/ThreeTrajectoryRenderer.ts

Behavior:

* Read `state.trajectories.toArray()`.
* Draw one line per entity trajectory.
* Use `simPoint2DToThree({ x, y }, height)` for every sample.
* Key each line by `entityId`.
* Remove stale lines when trajectories disappear.
* Dispose geometries/materials properly.
* Do not sample vehicle positions.
* Do not read vehicles directly unless needed for visual style.
* Do not mutate trajectory samples.
* Do not mutate `SimulationState`.

Suggested internal data:

```ts
type RenderedTrajectory = {
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  line: THREE.Line;
  lastSampleCount: number;
  lastLastSampleTimeSec?: number;
};
```

3. Visualization config

Keep renderer config only for visual style.

Add or update:

```ts
export type ThreeTrajectoryVisualizationConfig = {
  enabled: boolean;
  height: number;
  color: string;
  opacity: number;
  lineWidth: number;
};
```

Suggested defaults:

```ts
export const DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG = {
  enabled: true,
  height: 0.03,
  color: "#ff5050",
  opacity: 1.0,
  lineWidth: 2,
} satisfies ThreeTrajectoryVisualizationConfig;
```

Important:
Remove or deprecate these from renderer trail config:

* samplingMode
* maxPoints
* timeWindowSec
* minSampleDtSec
* minDistance

Those are now simulation tracking config, not renderer visualization config.

4. Update ThreeSimulationRenderer

Update render order:

```text
ground
axes
planned/reference paths
trajectories
vehicles
obstacles
dynamic actors
debug
```

or equivalent.

Requirements:

* Instantiate `ThreeTrajectoryRenderer`.
* Call `trajectoryRenderer.sync(state)` during render.
* Dispose it on renderer dispose.
* Provide methods for visualization only:

```ts
setTrajectoryVisualizationConfig(
  config: Partial<ThreeTrajectoryVisualizationConfig>
): void;

setTrajectoryVisualizationEnabled(enabled: boolean): void;
```

Do not provide renderer methods that clear source-of-truth trajectories.
Clearing actual trajectories should go through `SimulationController.clearTrajectories(...)`.

If a render cache clear method is needed, call it:

```ts
clearTrajectoryRenderCache(): void
```

and document that it does not clear `state.trajectories`.

5. Update viewport

Update `ThreeSimulationViewport.tsx`:

* Make sure reset/scenarioLoaded/tick render from `state.trajectories`.
* Do not call old `clearTrails()` to clear source data.
* If needed, call renderer cache clear only.
* When user clears trajectories from the Inspector, call `controller.clearTrajectories(...)`.

6. Inspector changes

Split controls into two sections:

A. Trajectory Tracking

This controls the simulation system:

* enabled
* trackAllSupportedEntities
* defaultSamplingMode
* defaultMaxSamples
* defaultTimeWindowSec
* defaultMinSampleDtSec
* defaultMinDistance
* optional per-entity tracking config

These should call a safe API that updates `TrajectoryTrackingSystem.setConfig(...)`.

If there is no existing safe API, add one through the composition root/controller.

B. Trajectory Visualization

This controls the renderer only:

* show trajectories
* color
* opacity
* height
* lineWidth

These update `ThreeTrajectoryRenderer` through `ThreeSimulationRenderer`.

C. Clear trajectories

Button:

```text
Clear trajectories
```

This must call:

```ts
controller.clearTrajectories()
```

not a renderer method.

7. Backward compatibility

If old UI labels say "Trail", it is okay to keep the user-facing label:

```text
Trajectory / Trail
```

But internally prefer:

```text
trajectory
```

over:

```text
trail
```

because the source of truth is now a generic entity trajectory, not vehicle-only renderer trail.

8. Remove or deprecate old ThreeTrailRenderer

Choose one:

Option A:

* Rename `ThreeTrailRenderer` to `ThreeTrajectoryRenderer`.
* Update imports.

Option B:

* Keep `ThreeTrailRenderer.ts` temporarily, but rewrite it to read `state.trajectories`.
* Add TODO to rename later.

Preferred:
Use `ThreeTrajectoryRenderer` if the codebase can handle the rename cleanly.

9. Phaser compatibility

Do not implement Phaser in this phase unless it already exists.

But keep the design renderer-agnostic:

* Future Phaser renderer should read `state.trajectories.toArray()`.
* It should draw with `simToPhaser`.
* No trajectory data should depend on Three.js.

10. Tests

Add/update tests:

ThreeTrajectoryRenderer:

* reads `state.trajectories`
* creates one line per entity trajectory
* removes stale lines
* uses `simPoint2DToThree`
* does not append samples
* does not mutate trajectory samples
* disposes geometry/materials

Inspector/UI:

* tracking controls update trajectory tracking config
* visualization controls update renderer config
* clear trajectories calls controller.clearTrajectories
* clear trajectories does not call renderer-only clear as source of truth

Architecture import tests:

* renderers do not write to `state.trajectories`
* no trajectory sampling remains in ThreeTrajectoryRenderer
* no direct mutation of trajectory samples from UI/renderer

11. Documentation update

Update `Architecture.md`:

* Add or update Layer: trajectories.
* Explain:

  * actual trajectories are simulation-owned
  * sampled by `TrajectoryTrackingSystem`
  * stored in `SimulationState.trajectories`
  * configured by scenario or Inspector
  * visualized by renderer adapters
  * different from `Path2D`

Update `Development_Guide.md`:

* Add short rule:

  * trajectory tracking belongs to the simulation layer
  * renderers visualize only
  * do not store actual trajectory history in renderer or entities

12. Expected result

After this phase:

* The old renderer-owned trail is migrated.
* The source of truth for actual trajectories is `state.trajectories`.
* Trajectory tracking works for any supported entity, not only vehicles.
* Three.js visualizes trajectories from simulation state.
* Inspector can configure tracking behavior and visualization separately.
* Clearing trajectories uses controller/engine API.
* The architecture remains deterministic and renderer-agnostic.

```
