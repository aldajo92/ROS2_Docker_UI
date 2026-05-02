I want to add path support to `angy_sim_ros2` while preserving the current architecture.

Context:
- The project has a rendering-agnostic simulation core.
- `Architecture.md` and `Development_Guide.md` are the source of truth.
- `src/simulation` and `src/math` must not import React, Three.js, Phaser, DOM APIs, WebSocket APIs, ROS2, DDS, Rapier, or infrastructure code.
- Renderers are read-only consumers of `SimulationState`.
- Vehicle commands must go through `VehicleCommandQueue`.
- Collision detection must go through `CollisionBackend2D`.
- Three.js coordinate mapping must stay centralized in `src/ui/renderers/three/mapping/`.

Goal:
Add support for planned/reference paths in the simulator.

Important distinction:
- A `Path` is a planned or reference route.
- A `Trail` is the actual historical trajectory followed by a vehicle.
- Do not store renderer trail data in the simulation core.
- Do not confuse planned paths with vehicle history.

Design decision:
Scenario files may declare paths when the path is part of the test case or scenario definition.
Examples:
- reference path
- target path
- planned path to visualize
- expected route for a vehicle
- route that a future planner/controller can follow

The real vehicle trail should remain renderer-owned visual/debug state, for example in `ThreeTrailRenderer`.

Required architecture:
Add generic path data structures to the simulation layer, but keep rendering-specific code outside the core.

Create or update:

src/simulation/paths/
  PathPoint2D.ts
  Path2D.ts
  PathRegistry.ts

src/simulation/scenarios/
  Scenario.ts
  ScenarioLoader.ts

src/ui/renderers/three/objects/
  ThreePathRenderer.ts

Optional later, but do not fully implement now:
src/simulation/communication/messages/
  SimPathMessage.ts

1. PathPoint2D.ts

Create a JSON-friendly path point type.

Use simulation coordinates:
- x in meters
- y in meters
- yaw in radians, optional
- targetVelocity in m/s, optional
- timeSec optional

Example:

```ts
export type PathPoint2D = {
  x: number;
  y: number;
  yaw?: number;
  targetVelocity?: number;
  timeSec?: number;
};
````

Rules:

* No Three.js types.
* No DOM types.
* No renderer dependencies.
* No Rapier types.
* No ROS2 types.

2. Path2D.ts

Create a generic path type.

```ts
import type { PathPoint2D } from "./PathPoint2D";

export type Path2D = {
  id: string;
  name?: string;
  frameId?: "map" | "world" | string;
  vehicleId?: string;
  points: PathPoint2D[];
  metadata?: Record<string, unknown>;
};
```

Rules:

* `vehicleId` is optional because a path may be global or assigned to a specific vehicle.
* `frameId` defaults to `"map"` or `"world"` if missing.
* Keep the type JSON-friendly.
* Do not make it depend on entities or renderers.

3. PathRegistry.ts

Create a registry for paths in the simulation core.

Suggested API:

```ts
import type { Path2D } from "./Path2D";

export class PathRegistry {
  private readonly paths = new Map<string, Path2D>();

  add(path: Path2D): void {
    this.paths.set(path.id, path);
  }

  remove(id: string): void {
    this.paths.delete(id);
  }

  get(id: string): Path2D | undefined {
    return this.paths.get(id);
  }

  has(id: string): boolean {
    return this.paths.has(id);
  }

  toArray(): Path2D[] {
    return [...this.paths.values()];
  }

  clear(): void {
    this.paths.clear();
  }

  size(): number {
    return this.paths.size;
  }
}
```

4. SimulationState integration

Add a `paths` registry to `SimulationState`.

Expected shape:

```ts
paths: PathRegistry
```

Rules:

* `paths` is part of simulation state because planned/reference paths are simulation data, not renderer data.
* Renderers may read `state.paths`.
* Renderers must not mutate `state.paths`.
* Scenario loading may populate `state.paths`.
* Future communication bridges may populate or update paths through a controlled API.

5. Scenario.ts

Extend `ScenarioSpec` to optionally include paths.

Example JSON shape:

```json
{
  "name": "simple-path-scenario",
  "entities": [
    {
      "type": "vehicle",
      "id": "ego",
      "pose": { "x": 0, "y": 0, "yaw": 0 },
      "v": 0,
      "w": 0,
      "radius": 0.4
    }
  ],
  "paths": [
    {
      "id": "ego-reference-path",
      "name": "Ego reference path",
      "vehicleId": "ego",
      "frameId": "map",
      "points": [
        { "x": 0, "y": 0, "yaw": 0, "targetVelocity": 1.0 },
        { "x": 2, "y": 0, "yaw": 0, "targetVelocity": 1.0 },
        { "x": 4, "y": 1, "yaw": 0.3, "targetVelocity": 1.0 }
      ]
    }
  ]
}
```

6. ScenarioLoader.ts

Update parsing/validation so scenario paths are validated.

Validation rules:

* `paths` is optional.
* Each path requires:

  * `id: string`
  * `points: array`
* Each point requires finite numeric:

  * `x`
  * `y`
* Optional finite numeric:

  * `yaw`
  * `targetVelocity`
  * `timeSec`
* Reject `NaN`, `Infinity`, missing points, or empty path points if the design requires at least one point.
* Do not import renderer code.
* Do not import Three.js.

7. SimulationEngine.loadScenario

When loading a scenario:

* reset entities
* reset metrics
* reset paths
* add entities
* add scenario paths to `state.paths`
* emit `scenarioLoaded`

Expected behavior:

* Reset clears old paths.
* Loading a new scenario replaces paths.
* Paths are deterministic and preserve scenario order.

8. ThreePathRenderer.ts

Implement path visualization in the Three.js renderer layer.

Rules:

* Reads `state.paths.toArray()`.
* Creates one `THREE.Line` per path.
* Uses `simPoint2DToThree` from the central mapping module.
* Does not mutate `SimulationState`.
* Does not mutate `Path2D`.
* Does not compute planning.
* Does not store path data in entities.
* Removes stale lines when paths disappear.
* Disposes geometry/materials properly.

Expected behavior:

* Path line is drawn slightly above the ground.
* Each path is keyed by `path.id`.
* If path points change, geometry updates.
* If no paths exist, nothing is rendered.

9. ThreeSimulationRenderer integration

Update `ThreeSimulationRenderer` so it owns `ThreePathRenderer`.

Expected render order:

* ground
* axes
* paths
* vehicles
* obstacles
* actors
* trails
* debug

This makes planned/reference paths visible beneath vehicles but above the ground.

10. Difference between Path and Trail

Document this clearly:

```text
Path:
  Planned/reference route.
  Can come from scenario, planner, communication, or UI.
  Stored in SimulationState through PathRegistry.

Trail:
  Actual vehicle history.
  Visual/debug only.
  Stored inside ThreeTrailRenderer.
  Cleared on reset/scenarioLoaded.
```

11. Future communication support

Do not fully implement this now unless trivial, but leave the design ready for:

```ts
export type SimPathMessage = {
  id: string;
  vehicleId?: string;
  frameId?: string;
  points: Array<{
    x: number;
    y: number;
    yaw?: number;
    targetVelocity?: number;
    timeSec?: number;
  }>;
};
```

Future flow:

```text
Python planner / ROS2 / WebSocket
  -> SimPathMessage
  -> MessageAdapter
  -> PathBridge
  -> state.paths.add(path)
  -> renderer displays path
```

If implementing a future inbound path bridge, it must not mutate renderer state directly.

12. Tests

Add tests for:

PathRegistry:

* add/get/remove
* insertion order
* clear
* size
* replacing same id

ScenarioLoader:

* parses scenario with paths
* rejects invalid path id
* rejects invalid point coordinates
* preserves path order
* optional fields work

SimulationEngine/loadScenario:

* scenario paths are loaded into state.paths
* reset clears paths
* loading a new scenario replaces old paths

ThreePathRenderer:

* if practical, test mapping usage and stale-path removal through lightweight unit tests
* do not over-test WebGL internals

13. Architecture documentation update

Update `Architecture.md` only if needed with a short section:

Layer: paths

Explain:

* paths are planned/reference routes
* paths may be declared in scenarios
* paths are stored in `SimulationState.paths`
* paths are rendered by renderer adapters
* paths are different from trails
* trails remain renderer-owned visual history

14. Preserve architecture boundaries

Forbidden:

* Do not put Three.js objects inside Path2D.
* Do not import Three.js into `src/simulation/paths`.
* Do not store trail history in `VehicleEntity`.
* Do not make VehicleEntity own planned paths.
* Do not make ThreePathRenderer mutate `state.paths`.
* Do not compute path planning inside ThreePathRenderer.
* Do not couple paths to ROS2 messages directly.

Expected result:

* Scenario files can optionally declare planned/reference paths.
* Paths are stored in simulation state as renderer-agnostic data.
* Three.js can visualize those paths.
* Vehicle trails remain separate from planned paths.
* Future Python planner or ROS2/WebSocket integration can reuse the same path model.

