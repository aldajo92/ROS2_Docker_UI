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
