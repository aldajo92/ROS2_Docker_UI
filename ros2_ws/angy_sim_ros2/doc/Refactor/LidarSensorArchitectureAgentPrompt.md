# Lidar Sensor Architecture Agent Prompt

Use this prompt when adding a simulated 2D lidar sensor to `angy_sim_ros2`.

This prompt is aligned with the current repository architecture:

- `doc/Architecture.md` and `doc/Development_Guide.md` are the source of truth.
- `doc/Topic_Support_Guide.md` defines the current topic lifecycle rules.
- `doc/Plugins.md` describes the current display-plugin architecture for
  inbound rendered topics.
- `doc/Refactor/FrameTransformArchitectureAgentPrompt.md` may later define
  fixed-frame / TF support, but TF is not required for the first lidar pass.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to add a deterministic simulated 2D lidar sensor with configurable
measurement noise, while preserving the simulator's current boundaries:

- Sensor simulation belongs in `src/simulation`.
- Renderers read `SimulationState` and never mutate it.
- Scenario JSON declares sensors and their initial configuration.
- Replay must reproduce recorded scans exactly.
- ROS-specific message shapes belong only in
  `src/infrastructure/communication/rosbridge/` if ROS output is added later.

Immediate goal:

- simulate lidar measurements inside the simulator
- store them in simulator-owned state
- render them in Three.js and Phaser
- persist them through replay

Future goal:

- publish simulated scans outward as ROS 2 `sensor_msgs/msg/LaserScan`
  through the existing outbound publisher architecture

Do not treat this as an inbound display-plugin task. This is simulator-owned
sensor generation first.

---

## Objective

Implement a first 2D lidar simulation capability:

```text
Scenario sensors
  -> LidarSensorSystem
  -> 2D raycast against simulation world
  -> deterministic noise model
  -> SimulationState.lidarScans
  -> Three/Phaser lidar renderers
  -> replay snapshot/restore
```

Future ROS output, if explicitly requested later:

```text
SimulationState.lidarScans
  -> outbound TopicBridge
  -> MessageAdapter
  -> Transport.publish('/scan', sensor_msgs/msg/LaserScan)
```

If ROS output is eventually added, it must follow the same outbound publisher
pattern already used by simulator publishers declared in `ScenarioSpec.publishers[]`
and wired by `CommunicationProvider` / `CommunicationSystem` / `PeriodicPublisher`.

---

## Architecture Constraints

Follow these rules strictly:

- Do not import ROS 2, roslib, rosbridge, WebSocket APIs, React, DOM APIs,
  Three.js, Phaser, or infrastructure modules inside `src/simulation/sensors`.
- Do not compute lidar scans inside renderers.
- Do not store renderer objects in sensor state.
- Do not use global `Math.random()` inside simulation systems.
- Use deterministic seeded randomness for noise.
- Do not publish ROS messages directly from `LidarSensorSystem`.
- Do not mutate `SimulationState` outside `SimulationSystem.update(...)`.
- Replay must restore recorded scans without recalculating raycasts or noise.
- Keep the first pass transport-agnostic. ROS output is a later boundary step.

---

## Current Repository Assumptions

These are true in the current codebase and your implementation should match them:

- `SimulationState` already owns registries such as `paths`, `poseArrays`,
  and `trajectories`; lidar should follow that style.
- Scenario entities already support:
  - vehicles
  - static obstacles, including circles and rectangles
  - dynamic actors
- Replay already persists entities, metrics, and optional trajectories through:
  - `SimulationFrameSnapshot.ts`
  - `createSnapshotFromState.ts`
  - `createReplayStateFromFrame.ts`
- Outbound ROS publishers already use scenario-driven `publishers[]` entries,
  not hardcoded always-on transport hooks.

Design lidar to fit into those patterns.

---

## Initial Data Contracts

Create JSON-safe internal data types.

### `LidarScan2D`

```ts
export interface LidarScan2D {
  id: string
  sensorId: string
  parentEntityId?: string
  frameId?: string
  timeSec: number

  angleMin: number
  angleMax: number
  angleIncrement: number

  rangeMin: number
  rangeMax: number

  ranges: number[]
  intensities?: number[]

  metadata?: Record<string, unknown>
}
```

Rules:

- `ranges.length` must match the ray count implied by the angular fields.
- Keep the shape JSON-safe.
- Prefer finite numeric ranges in the first pass so replay JSON stays simple.

Recommended first-pass encoding:

- no hit => `rangeMax`
- dropout => `rangeMax`
- all `ranges[]` values finite

### `LidarSensorSpec`

```ts
export interface LidarSensorSpec {
  kind: 'lidar2d'
  id: string
  parentEntityId?: string
  frameId?: string
  pose?: { x: number; y: number; yaw?: number }

  enabled?: boolean
  rateHz?: number

  angleMin: number
  angleMax: number
  rayCount: number

  rangeMin: number
  rangeMax: number

  includeStaticObstacles?: boolean
  includeVehicles?: boolean
  includeDynamicActors?: boolean

  noise?: LidarNoiseConfig
}
```

### `LidarNoiseConfig`

```ts
export interface LidarNoiseConfig {
  enabled?: boolean
  rangeStdDev?: number
  rangeBias?: number
  angularStdDev?: number
  dropoutProbability?: number
  outlierProbability?: number
  outlierMinRange?: number
  outlierMaxRange?: number
  quantizationStep?: number
  seed?: number
}
```

Validation:

- `rateHz` must be finite and > 0 when provided.
- `angleMax` must be greater than `angleMin`.
- `rayCount` must be an integer >= 2.
- `rangeMin` must be finite and >= 0.
- `rangeMax` must be finite and greater than `rangeMin`.
- Probabilities must be in `[0, 1]`.
- Standard deviations must be finite and >= 0.
- `quantizationStep` must be finite and > 0 when provided.
- `seed` must be a finite integer when provided.

---

## Scenario JSON Contract

Add optional top-level `sensors` support to the scenario model.

This does not exist in the current `Scenario.ts` yet, so you must extend the
scenario contract in a backward-compatible way.

Example:

```json
{
  "name": "lidar-demo",
  "entities": [
    {
      "kind": "vehicle",
      "id": "ego",
      "pose": { "x": 0, "y": 0, "yaw": 0 }
    },
    {
      "kind": "static_obstacle",
      "id": "wall",
      "shape": "rectangle",
      "rectangle": {
        "mode": "segment",
        "start": { "x": 3, "y": -1 },
        "end": { "x": 3, "y": 1 },
        "thickness": 0.2
      }
    }
  ],
  "sensors": [
    {
      "kind": "lidar2d",
      "id": "front_lidar",
      "parentEntityId": "ego",
      "frameId": "ego/lidar",
      "pose": { "x": 0.25, "y": 0, "yaw": 0 },
      "rateHz": 10,
      "angleMin": -1.57079632679,
      "angleMax": 1.57079632679,
      "rayCount": 181,
      "rangeMin": 0.05,
      "rangeMax": 8,
      "includeStaticObstacles": true,
      "includeVehicles": false,
      "includeDynamicActors": false,
      "noise": {
        "enabled": true,
        "rangeStdDev": 0.02,
        "rangeBias": 0,
        "dropoutProbability": 0.01,
        "outlierProbability": 0.005,
        "quantizationStep": 0.001,
        "seed": 1234
      }
    }
  ]
}
```

Parsing flow:

```text
ScenarioLoader.parse()
  -> ScenarioSpec.sensors?: LidarSensorSpec[]
  -> SimulationEngine.loadScenario()
  -> LidarSensorSystem receives/reloads sensor specs
```

Backward-compatibility rules:

- scenarios without `sensors` must still parse and run unchanged
- old scenario files must remain valid
- sensor validation errors should be reported the same way other scenario
  validation errors are reported

---

## Proposed File Layout

Simulation contracts:

```text
src/simulation/sensors/
  LidarScan2D.ts
  LidarScanRegistry.ts
  LidarSensorSpec.ts
  LidarNoiseModel.ts
  LidarRaycast2D.ts
  SeededRandom.ts
```

Simulation system:

```text
src/simulation/systems/
  LidarSensorSystem.ts
```

Scenario:

```text
src/simulation/scenarios/
  Scenario.ts
  ScenarioLoader.ts
```

Recording/replay:

```text
src/simulation/recording/
  SimulationFrameSnapshot.ts
  createSnapshotFromState.ts
  createReplayStateFromFrame.ts
```

Renderers:

```text
src/ui/renderers/three/objects/
  ThreeLidarScanRenderer.ts

src/ui/renderers/phaser/objects/
  PhaserLidarScanRenderer.ts
```

Future ROS output only if explicitly requested:

```text
src/simulation/communication/messages/
  SimLidarScanMessage.ts

src/simulation/communication/bridges/
  LidarScanPublisherBridge.ts

src/infrastructure/communication/rosbridge/adapters/
  SimLidarScanToRosLaserScanAdapter.ts
```

If future ROS output is implemented, also extend scenario publisher support in:

```text
src/simulation/scenarios/Scenario.ts
src/app/CommunicationProvider.tsx
```

following the existing `publishers[]` architecture instead of inventing a new
transport path.

---

## Simulation State and Registry

Add a registry similar to existing `PathRegistry`, `PoseArrayRegistry`, and
`TrajectoryRegistry`.

```ts
export class LidarScanRegistry {
  add(scan: LidarScan2D): void
  remove(id: string): void
  get(id: string): LidarScan2D | undefined
  has(id: string): boolean
  toArray(): LidarScan2D[]
  clear(): void
  size(): number
}
```

Add to `SimulationState`:

```ts
readonly lidarScans: LidarScanRegistry
```

Reset behavior:

```text
SimulationEngine.reset()
  -> state.lidarScans.clear()
```

Match the current style of other registries:

- registry owned by `SimulationState`
- renderer reads `state.lidarScans.toArray()`
- replay restores into the registry instead of recomputing

---

## Lidar Sensor System

`LidarSensorSystem` is responsible for generating scans during the simulation
tick.

Responsibilities:

- hold configured `LidarSensorSpec[]`
- respect `enabled` and `rateHz`
- resolve sensor pose
  - if `parentEntityId` exists, sensor pose is relative to that entity pose
  - if `parentEntityId` is absent, pose is in world coordinates
- cast rays against selected world objects
- apply deterministic noise
- write the latest scan to `state.lidarScans`

Non-responsibilities:

- no rendering
- no ROS publishing
- no DOM/UI
- no direct transport communication

Rate policy:

```text
accumulate dt per sensor
if accumulated >= 1 / rateHz:
  generate one scan
  subtract or reset accumulator
```

Use the same simulation-time principle already used by `PeriodicPublisher`:

- paused simulation => no new scans
- fast-forward => scans advance with simulation time, not wall time

Register the system in the explicit engine system order without breaking the
existing order guarantees described in `Development_Guide.md`.

---

## Raycasting Scope

First implementation should support raycasts against:

- circular static obstacles
- rectangular static obstacles

If practical, also support:

- vehicles as circles using vehicle radius
- dynamic actors as circles using actor radius

Keep raycast math pure and testable.

Suggested API:

```ts
export interface RaycastInput2D {
  origin: { x: number; y: number }
  angle: number
  rangeMin: number
  rangeMax: number
}

export interface RaycastHit2D {
  range: number
  point: { x: number; y: number }
  objectId?: string
  objectKind?: string
}

export function castLidarRay2D(
  input: RaycastInput2D,
  shapes: readonly LidarRaycastShape2D[],
): RaycastHit2D | undefined
```

Recommended structure:

```text
SimulationState
  -> extract lidar-raycast shapes
  -> pure ray-vs-shape intersection
```

Do not bury geometry logic directly inside renderer code or transport code.

Because static obstacles already have normalized circle/rectangle geometry in the
current repo, prefer reusing that normalized shape contract instead of inventing
another rectangle representation.

---

## Noise Model

Implement noise as a pure function with injected seeded RNG.

Suggested flow for each ray:

```text
ideal range
  -> rangeBias
  -> gaussian range noise
  -> optional angular noise, if implemented before raycast
  -> quantization
  -> dropout
  -> outlier
  -> clamp/policy
```

Important:

- noise must be deterministic for a fixed seed, scenario, and simulation tick
- tests must not rely on global randomness
- default noise is disabled unless the scenario enables it

Suggested API:

```ts
export function applyLidarRangeNoise(
  range: number,
  config: Required<LidarNoiseConfig>,
  rng: SeededRandom,
  rangeMin: number,
  rangeMax: number,
): number
```

---

## Rendering

Add renderer support only after the scan exists in simulator state.

Three renderer:

- draw hit points and/or rays using Three.js primitives
- read from `state.lidarScans.toArray()`
- use centralized coordinate mapping helpers
- keep renderer cache keyed by scan `id`
- dispose objects when scans disappear

Phaser renderer:

- draw rays/hit points using `Graphics`
- read from `state.lidarScans.toArray()`
- respect viewport mapping

Initial visual style:

- rays: faint cyan/blue lines
- hit points: small brighter dots

Initial renderer config may be simple:

```ts
{
  showRays: true,
  showHitPoints: true,
  rayColor: '#2a7bff',
  pointColor: '#00ffff',
  opacity: 0.35,
}
```

Do not expose UI controls in the first pass unless explicitly requested.

---

## Replay Contract

Lidar scans must be playback-safe.

Extend `SimulationFrameSnapshot` with an optional field:

```ts
lidarScans?: LidarScan2D[]
```

Snapshot:

```text
createSnapshotFromState()
  -> copy state.lidarScans.toArray()
  -> include lidarScans only when non-empty
```

Restore:

```text
createReplayStateFromFrame()
  -> for each frame.lidarScans ?? []
     -> state.lidarScans.add(scan)
```

Replay rules:

- replay must reproduce recorded noisy measurements exactly
- replay must not rerun raycasts
- replay must not rerun random noise generation
- old replay files without `lidarScans` must still load
- the new field must remain optional

Follow the current replay style already used in:

- `SimulationFrameSnapshot.ts`
- `createSnapshotFromState.ts`
- `createReplayStateFromFrame.ts`

In particular:

- keep everything JSON-safe
- omit empty optional fields where consistent
- preserve backward compatibility with older replay files

---

## Future ROS 2 LaserScan Output

Do not implement unless explicitly requested, but keep the design compatible
with the current outbound publisher architecture.

If implemented later, the correct path is:

```text
ScenarioSpec.publishers[]
  -> CommunicationProvider
  -> TopicBridge
  -> MessageAdapter
  -> Transport.publish(...)
```

Do not create a side-channel publisher outside that architecture.

Future adapter mapping:

```text
LidarScan2D or SimLidarScanMessage
  -> sensor_msgs/msg/LaserScan
```

Keep ROS message naming and wire-format logic under rosbridge infrastructure
only. The simulation layer must not know about `sensor_msgs/msg/LaserScan`.

---

## Tests Required

Add tests for:

1. Scenario parsing
   - accepts valid `sensors` block
   - rejects invalid `kind`
   - validates `rateHz`, angle range, ray count, range limits
   - validates noise config
   - scenarios without sensors remain valid

2. Registry
   - add/get/remove/clear/size
   - `toArray` returns a snapshot

3. Raycast math
   - ray hits circle obstacle
   - ray misses circle obstacle
   - ray hits rectangle obstacle
   - closest hit wins
   - respects `rangeMin` / `rangeMax`

4. Noise model
   - disabled noise returns ideal range
   - bias applies
   - quantization applies
   - dropout probability 1 returns dropout value
   - deterministic seed produces stable output

5. Lidar system
   - generates scans at configured rate
   - attaches to parent entity pose
   - world sensor works without parent entity
   - disabled sensor produces no scan
   - scan is written to `state.lidarScans`

6. Replay
   - `createSnapshotFromState` includes scans when present
   - `createReplayStateFromFrame` restores scans
   - old frames without scans still load

7. Renderers
   - construct/dispose without throwing
   - remove stale scan graphics/objects
   - respect state changes

8. Architecture
   - `src/simulation/sensors` imports no ROS/UI/renderer/infrastructure code
   - ROS LaserScan adapter, if later added, lives under rosbridge infrastructure

---

## Verification

Run:

```bash
npm test
npx eslint src/simulation src/ui src/app src/infrastructure/communication/rosbridge
npx tsc -b --noEmit
```

If `tsc` has pre-existing unrelated failures, report those exact files and
confirm the lidar work does not introduce additional TypeScript errors.

---

## Acceptance Criteria

The lidar feature is complete when:

- scenario JSON can declare at least one `lidar2d` sensor
- the simulation produces deterministic `LidarScan2D` values at the configured
  simulation-time rate
- noise parameters are configurable and tested
- the latest scan is stored in `SimulationState.lidarScans`
- Three.js and Phaser can visualize the scan
- replay snapshots and restores lidar scans
- the implementation does not introduce ROS types into simulation or renderer
  code
- existing tests remain green

---

## Future Work

After the first implementation:

- publish `LidarScan2D` outward as ROS 2 `sensor_msgs/msg/LaserScan`
- add lidar UI controls for noise/rate/range
- add support for external `LaserScan` topic rendering only if explicitly needed
- add frame transform support once TF/fixed-frame architecture exists
- add raycast acceleration or backend integration if performance requires it
- add intensity simulation
- add occlusion policies for vehicles/dynamic actors
- add multi-echo or 3D lidar only if needed
