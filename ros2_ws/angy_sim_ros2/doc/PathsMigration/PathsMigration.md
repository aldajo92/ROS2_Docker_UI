Sí, dividirlo en 3 prompts es mejor. Te propongo este plan:

```text
Prompt 1:
Crear la capa genérica de trayectorias en simulation.

Prompt 2:
Conectar scenario + engine + system order.

Prompt 3:
Migrar el renderer/Inspector para consumir state.trajectories.
```

---

## Prompt 1: crear la capa genérica de trayectorias

````text
I want to add a generic simulation-owned trajectory tracking model to `angy_sim_ros2`.

Context:
- Follow `Architecture.md` and `Development_Guide.md`.
- This is Phase 1 of a migration.
- Do not modify the renderer yet.
- Do not modify the Inspector yet.
- Do not modify scenario loading yet unless strictly needed for imports/types.
- The current vehicle trail may still exist in the renderer for now.
- The goal of this phase is only to create the simulation-level trajectory data model and registry.

Important distinction:
- `Path2D` = planned/reference route.
- `Trajectory` = actual historical runtime samples of an entity.
- Trajectory tracking should be generic and entity-based, not vehicle-only.

Architecture rules:
- Do not import React, Three.js, Phaser, DOM APIs, Rapier, WebSocket, ROS2, DDS, or infrastructure code inside `src/simulation` or `src/math`.
- Do not store trajectory samples inside `VehicleEntity`.
- Do not mutate trajectories from renderers.
- This phase should create the data model only.

Create:

src/simulation/trajectories/
  TrajectorySample2D.ts
  EntityTrajectory2D.ts
  TrajectoryRegistry.ts
  TrajectoryTrackingConfig.ts
  getEntityTrajectoryPose2D.ts

1. Create `TrajectorySample2D.ts`

```ts
export type TrajectorySample2D = {
  timeSec: number;
  x: number;
  y: number;
  yaw?: number;
  speed?: number;
};
````

Rules:

* `timeSec` is simulation time.
* `x` and `y` are simulation coordinates in meters.
* `yaw` is optional and in radians.
* `speed` is optional.
* Keep it JSON-friendly.

2. Create `EntityTrajectory2D.ts`

```ts
import type { TrajectorySample2D } from "./TrajectorySample2D";

export type EntityTrajectory2D = {
  entityId: string;
  samples: TrajectorySample2D[];
  metadata?: Record<string, unknown>;
};

export type ReadonlyEntityTrajectory2D = {
  readonly entityId: string;
  readonly samples: readonly TrajectorySample2D[];
  readonly metadata?: Readonly<Record<string, unknown>>;
};
```

3. Create `TrajectoryRegistry.ts`

Requirements:

* Store trajectories by `entityId`.
* Support add/append/clear/prune.
* Enforce max sample count.
* Expose readonly or defensive-copy access to prevent renderer mutation.
* Preserve insertion order.

Suggested API:

```ts
import type {
  EntityTrajectory2D,
  ReadonlyEntityTrajectory2D,
} from "./EntityTrajectory2D";
import type { TrajectorySample2D } from "./TrajectorySample2D";

export class TrajectoryRegistry {
  private readonly trajectories = new Map<string, EntityTrajectory2D>();

  get(entityId: string): ReadonlyEntityTrajectory2D | undefined {
    const trajectory = this.trajectories.get(entityId);
    if (!trajectory) return undefined;

    return {
      entityId: trajectory.entityId,
      samples: [...trajectory.samples],
      metadata: trajectory.metadata ? { ...trajectory.metadata } : undefined,
    };
  }

  has(entityId: string): boolean {
    return this.trajectories.has(entityId);
  }

  ensure(entityId: string): void {
    if (!this.trajectories.has(entityId)) {
      this.trajectories.set(entityId, {
        entityId,
        samples: [],
      });
    }
  }

  append(entityId: string, sample: TrajectorySample2D, maxSamples: number): void {
    this.ensure(entityId);

    const trajectory = this.trajectories.get(entityId);
    if (!trajectory) return;

    trajectory.samples.push(sample);

    while (trajectory.samples.length > maxSamples) {
      trajectory.samples.shift();
    }
  }

  pruneOlderThan(entityId: string, minTimeSec: number): void {
    const trajectory = this.trajectories.get(entityId);
    if (!trajectory) return;

    trajectory.samples = trajectory.samples.filter(
      (sample) => sample.timeSec >= minTimeSec
    );
  }

  clear(entityId?: string): void {
    if (entityId) {
      this.trajectories.delete(entityId);
      return;
    }

    this.trajectories.clear();
  }

  remove(entityId: string): void {
    this.trajectories.delete(entityId);
  }

  toArray(): ReadonlyEntityTrajectory2D[] {
    return [...this.trajectories.values()].map((trajectory) => ({
      entityId: trajectory.entityId,
      samples: [...trajectory.samples],
      metadata: trajectory.metadata ? { ...trajectory.metadata } : undefined,
    }));
  }

  size(): number {
    return this.trajectories.size;
  }
}
```

4. Create `TrajectoryTrackingConfig.ts`

```ts
export type TrajectorySamplingMode = "pointCount" | "timeWindow";

export type EntityTrajectoryTrackingConfig = {
  entityId: string;
  enabled?: boolean;
  samplingMode?: TrajectorySamplingMode;
  maxSamples?: number;
  timeWindowSec?: number;
  minSampleDtSec?: number;
  minDistance?: number;
};

export type TrajectoryTrackingConfig = {
  enabled?: boolean;
  trackAllSupportedEntities?: boolean;

  defaultSamplingMode?: TrajectorySamplingMode;
  defaultMaxSamples?: number;
  defaultTimeWindowSec?: number;
  defaultMinSampleDtSec?: number;
  defaultMinDistance?: number;

  entities?: EntityTrajectoryTrackingConfig[];
};

export const DEFAULT_TRAJECTORY_TRACKING_CONFIG = {
  enabled: false,
  trackAllSupportedEntities: false,
  defaultSamplingMode: "pointCount",
  defaultMaxSamples: 500,
  defaultTimeWindowSec: 10,
  defaultMinSampleDtSec: 0,
  defaultMinDistance: 0,
  entities: [],
} satisfies Required<TrajectoryTrackingConfig>;
```

Rules:

* `pointCount` keeps the last `maxSamples`.
* `timeWindow` keeps samples newer than `currentTimeSec - timeWindowSec`, and also enforces `maxSamples`.
* `minDistance = 0` means append even if stopped.
* `minSampleDtSec = 0` means append every tick.

5. Create `getEntityTrajectoryPose2D.ts`

Create a helper that extracts a generic 2D trajectory pose from supported entities.

```ts
import type { Entity } from "../entities/Entity";

export type TrajectoryPose2D = {
  x: number;
  y: number;
  yaw?: number;
  speed?: number;
};

export function getEntityTrajectoryPose2D(
  entity: Entity
): TrajectoryPose2D | undefined {
  // VehicleEntity:
  // use public pose API.
  // include yaw and speed if available.
  //
  // DynamicActorEntity:
  // use public pose or position API.
  //
  // StaticObstacleEntity:
  // return undefined by default, unless the current design wants to support static entities.
  //
  // Unsupported entities:
  // return undefined.
}
```

Rules:

* Use public entity APIs only.
* Do not access private fields.
* Do not import renderer code.
* Do not import Three.js.
* Return `undefined` for unsupported entities.

6. Add tests

Create tests for:

TrajectoryRegistry:

* starts empty
* ensure creates trajectory
* append adds samples
* append enforces maxSamples
* pruneOlderThan removes old samples
* clear one entity
* clear all
* toArray returns defensive copies or readonly-safe data
* insertion order is deterministic

getEntityTrajectoryPose2D:

* extracts vehicle pose if supported
* extracts dynamic actor pose if supported
* returns undefined for unsupported/static entities if that is the selected policy

7. Expected result

After this phase:

* The project has a generic simulation-level trajectory model.
* No renderer behavior has changed yet.
* The existing renderer-owned trail can still exist temporarily.
* No forbidden imports are introduced.

````

---

## Prompt 2: integrar con SimulationState, sistema y scenarios

```text
I want to implement Phase 2 of generic trajectory tracking in `angy_sim_ros2`.

Context:
- Phase 1 already created:
  - TrajectorySample2D
  - EntityTrajectory2D
  - TrajectoryRegistry
  - TrajectoryTrackingConfig
  - getEntityTrajectoryPose2D
- Now I want to integrate trajectories into SimulationState, add a TrajectoryTrackingSystem, and allow scenarios to configure trajectory tracking.
- Do not migrate the renderer yet.
- Do not remove the existing renderer-owned trail yet.
- Follow `Architecture.md` and `Development_Guide.md`.

Goal:
Add simulation-owned trajectory tracking.

Expected architecture:

Scenario
  -> trajectoryTracking config

ScenarioLoader
  -> validates config

SimulationState
  -> owns trajectories: TrajectoryRegistry

TrajectoryTrackingSystem
  -> samples configured entities after dynamics
  -> writes samples into state.trajectories

Architecture rules:
- Systems may mutate simulation state during tick.
- Renderers must not mutate SimulationState.
- Do not import React, Three.js, Phaser, DOM APIs, Rapier, WebSocket, ROS2, DDS, or infrastructure code inside `src/simulation` or `src/math`.
- Do not store trajectory samples inside VehicleEntity.
- Do not store trajectory samples inside renderers as source of truth after the future migration.

Files to update/create:

src/simulation/core/SimulationState.ts
src/simulation/core/SimulationEngine.ts
src/simulation/core/SimulationController.ts
src/simulation/scenarios/Scenario.ts
src/simulation/scenarios/ScenarioLoader.ts
src/simulation/systems/TrajectoryTrackingSystem.ts
src/simulation/systems/SystemManager.ts if needed
src/app/SimulationProvider.tsx or equivalent composition root

1. Add trajectories to SimulationState

Update `SimulationState` to include:

```ts
import { TrajectoryRegistry } from "../trajectories/TrajectoryRegistry";

trajectories: TrajectoryRegistry;
````

Initialize it when SimulationState is created.

Rules:

* `state.trajectories` is simulation-owned data.
* The normal writer is `TrajectoryTrackingSystem`.
* Renderers may read it later, but must not mutate it.

2. Add TrajectoryTrackingSystem

Create:

src/simulation/systems/TrajectoryTrackingSystem.ts

Responsibilities:

* Run during simulation tick.
* Read a `TrajectoryTrackingConfig`.
* Sample configured entities.
* Write samples to `state.trajectories`.
* Support both `pointCount` and `timeWindow`.
* Support `trackAllSupportedEntities`.
* Support per-entity overrides.
* Provide:

  * `setConfig(config: TrajectoryTrackingConfig): void`
  * `getConfig(): TrajectoryTrackingConfig`
  * `reset(): void`

Required system order:

```text
ScenarioSystem
VehicleCommandSystem
VehicleDynamicsSystem
TrajectoryTrackingSystem
CollisionSystem
MetricsSystem
CommunicationSystem optional
```

Reason:

* It must run after VehicleDynamicsSystem so it samples the integrated pose for the current tick.
* It must not affect vehicle motion.
* It must not affect collision behavior.

Append logic:

* If disabled, do nothing.
* If no previous sample exists for an entity, append.
* If `minSampleDtSec > 0`, require enough simulation time since previous sample.
* If `minDistance > 0`, require enough Euclidean distance since previous sample.
* If both are zero, append every tick.
* For `pointCount`, keep last `maxSamples`.
* For `timeWindow`, remove samples older than `currentTimeSec - timeWindowSec`, then enforce `maxSamples`.

Important:

* Use `state.clock.time()` for sample time.
* Do not use wall-clock time.
* Do not use `Date.now()`.
* Do not use browser time.

3. Config normalization

Implement helper functions inside the system file or a nearby utility:

```ts
normalizeTrajectoryTrackingConfig(...)
resolveTrackedEntities(...)
shouldAppendSample(...)
```

Rules:

* Fill missing values from defaults.
* Per-entity config overrides global defaults.
* `trackAllSupportedEntities: true` tracks all entities for which `getEntityTrajectoryPose2D(entity)` returns a pose.
* If `trackAllSupportedEntities` is true, per-entity `enabled: false` disables that specific entity.
* If `trackAllSupportedEntities` is false, track only explicitly listed entities with `enabled !== false`.

4. Extend ScenarioSpec

Update `Scenario.ts`:

```ts
import type { TrajectoryTrackingConfig } from "../trajectories/TrajectoryTrackingConfig";

export type ScenarioSpec = {
  name: string;
  description?: string;
  entities: EntitySpec[];
  paths?: Path2D[];
  interaction?: ScenarioInteractionConfig;
  trajectoryTracking?: TrajectoryTrackingConfig;
};
```

5. Update ScenarioLoader validation

Validation rules:

* `trajectoryTracking` is optional.
* `enabled` must be boolean if present.
* `trackAllSupportedEntities` must be boolean if present.
* `defaultSamplingMode` must be `"pointCount"` or `"timeWindow"` if present.
* `defaultMaxSamples` must be finite integer >= 2 if present.
* `defaultTimeWindowSec` must be finite number > 0 if present.
* `defaultMinSampleDtSec` must be finite number >= 0 if present.
* `defaultMinDistance` must be finite number >= 0 if present.
* `entities` must be an array if present.
* Each entity config requires `entityId: string`.
* Per-entity fields follow the same validation as defaults.
* Do not require entity ids to exist during parsing.

Example scenario:

```json
{
  "name": "tracking-scenario",
  "description": "Tracks ego and actor_1.",
  "trajectoryTracking": {
    "enabled": true,
    "trackAllSupportedEntities": false,
    "defaultSamplingMode": "pointCount",
    "defaultMaxSamples": 500,
    "defaultMinDistance": 0,
    "entities": [
      {
        "entityId": "ego",
        "enabled": true,
        "samplingMode": "pointCount",
        "maxSamples": 500
      },
      {
        "entityId": "actor_1",
        "enabled": true,
        "samplingMode": "timeWindow",
        "timeWindowSec": 10,
        "maxSamples": 500,
        "minSampleDtSec": 0.05,
        "minDistance": 0.01
      }
    ]
  },
  "entities": []
}
```

6. Engine/controller integration

Update `SimulationEngine`:

* `reset()` clears `state.trajectories`.
* `loadScenario(...)` clears previous trajectories.
* Add method:

```ts
clearTrajectories(entityId?: string): void
```

This should clear `state.trajectories`.

Update `SimulationController`:

* Add:

```ts
clearTrajectories(entityId?: string): void
```

It should delegate to the engine.

Optional events:

* Add `trajectoriesCleared` or `trajectoriesChanged` only if needed for UI/render refresh.
* Do not add events unnecessarily if tick/reset/scenarioLoaded already trigger render.

7. Scenario config application

When a scenario is loaded, apply its `trajectoryTracking` config to the registered `TrajectoryTrackingSystem`.

Choose a clean method based on the existing architecture:

Option A:

* The composition root keeps a reference to `TrajectoryTrackingSystem`.
* On `scenarioLoaded`, it calls `trajectoryTrackingSystem.setConfig(...)`.

Option B:

* `SimulationEngine.loadScenario(...)` returns or emits the full scenario spec.
* The system updates from scenario metadata safely.

Use the simplest option that fits the existing code.

Default behavior:

* If the scenario has no `trajectoryTracking`, use default config with tracking disabled.
* Loading a new scenario replaces the trajectory tracking config.
* Reset/reload reapplies scenario defaults if the existing code already does that for scenario metadata.

8. Register system

Update composition root, likely `SimulationProvider.tsx`, to register:

```ts
new TrajectoryTrackingSystem()
```

in this order:

```text
ScenarioSystem
VehicleCommandSystem
VehicleDynamicsSystem
TrajectoryTrackingSystem
CollisionSystem
MetricsSystem
CommunicationSystem optional
```

9. Tests

Add tests for:

TrajectoryTrackingSystem:

* does nothing when disabled
* tracks configured vehicle
* tracks configured dynamic actor
* ignores unsupported entity
* supports pointCount mode
* supports timeWindow mode
* minSampleDtSec prevents oversampling
* minDistance prevents oversampling
* minDistance = 0 appends even when stopped
* trackAllSupportedEntities tracks supported entities
* per-entity config overrides defaults
* per-entity enabled false disables tracking
* reset clears internal last-sample state

ScenarioLoader:

* accepts trajectoryTracking config
* rejects invalid sampling mode
* rejects invalid numeric fields
* accepts missing trajectoryTracking
* preserves entity configs

SimulationEngine / Controller:

* reset clears trajectories
* loadScenario clears old trajectories
* clearTrajectories clears registry

Architecture import tests:

* `src/simulation/trajectories` must not import Three.js, React, Phaser, Rapier, DOM, infrastructure.
* `TrajectoryTrackingSystem` must not import renderer code.

10. Expected result

After this phase:

* Trajectory tracking exists as simulation-owned state.
* Scenarios can configure which entities are tracked.
* Trajectories are sampled by a system after dynamics.
* Renderers are not migrated yet.
* Existing visual trail may still be renderer-owned temporarily.
* No forbidden imports are introduced.

````

---

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
```
