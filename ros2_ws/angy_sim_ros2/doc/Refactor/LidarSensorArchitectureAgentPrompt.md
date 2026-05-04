# Lidar Sensor Architecture Agent Prompt

Use this prompt when adding a simulated 2D lidar sensor to `angy_sim_ros2`.

This prompt assumes:

- `doc/Architecture.md` and `doc/Development_Guide.md` are the source of truth.
- `doc/Refactor/DisplayPluginArchitectureAgentPrompt.md` defines the target
  display plugin architecture.
- `doc/Refactor/FrameTransformArchitectureAgentPrompt.md` may later define
  fixed-frame / TF support.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to add a deterministic simulated 2D lidar sensor with configurable
measurement noise, while preserving the simulator's existing boundaries:

- Sensor simulation belongs in `src/simulation`.
- Renderers read `SimulationState` and never mutate it.
- ROS2-specific message formats belong in
  `src/infrastructure/communication/rosbridge`.
- Scenario JSON declares sensors and their initial configuration.
- Replay must be able to reproduce recorded scans.

The immediate goal is not to create an RViz display for external `LaserScan`
topics. The immediate goal is to simulate lidar measurements inside the
simulator.

The future goal is to publish simulated scans as `sensor_msgs/msg/LaserScan`
through the transport layer.

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

Future ROS output:

```text
SimulationState.lidarScans
  -> SimLidarScanToRosLaserScanAdapter
  -> Transport.publish('/scan', sensor_msgs/msg/LaserScan)
```

---

## Architecture Constraints

Follow these rules strictly:

- Do not import ROS2, roslib, rosbridge, WebSocket APIs, React, DOM APIs,
  Three.js, Phaser, or infrastructure modules inside `src/simulation/sensors`.
- Do not compute sensor scans inside renderers.
- Do not store Three.js/Phaser objects in sensor state.
- Do not use non-deterministic `Math.random()` directly in simulation systems.
  Use an injectable seeded RNG for noise.
- Do not publish ROS messages directly from `LidarSensorSystem`.
- Do not mutate `SimulationState` outside `SimulationSystem.update(...)`.
- Replay must restore recorded scans without recalculating raycasts/noise.

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

- `ranges.length` must match the ray count implied by angular fields.
- Ranges should be finite numbers or `Infinity` if the project chooses to encode
  no-hit as `Infinity`. Pick one policy and test it.
- Keep the shape JSON-safe.

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

Add optional top-level `sensors`.

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

Keep scenario support backward compatible: scenarios without `sensors` continue
to parse and run.

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

Future ROS output:

```text
src/infrastructure/communication/rosbridge/adapters/
  SimLidarScanToRosLaserScanAdapter.ts

src/simulation/communication/bridges/
  LidarScanPublisherBridge.ts
```

Only implement future ROS output if explicitly requested.

---

## Simulation State and Registry

Add a registry similar to existing `PathRegistry` / `TrajectoryRegistry`.

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

---

## Lidar Sensor System

`LidarSensorSystem` is responsible for generating scans during the simulation
tick.

Responsibilities:

- Hold configured `LidarSensorSpec[]`.
- Respect `enabled` and `rateHz`.
- Resolve sensor pose:
  - if `parentEntityId` exists, sensor pose is relative to that entity pose.
  - if `parentEntityId` is absent, pose is in world/sim coordinates.
- Cast rays against selected world objects.
- Apply deterministic noise.
- Write latest scan to `state.lidarScans`.

Non-responsibilities:

- No rendering.
- No ROS publishing.
- No DOM/UI.
- No direct network communication.

Rate policy:

```text
accumulate dt per sensor
if accumulated >= 1 / rateHz:
  generate one scan
  subtract or reset accumulator
```

Use the same simulation-time principle as `PeriodicPublisher`: paused sim means
no new scans; fast-forward produces scans according to simulated time.

---

## Raycasting Scope

First implementation should support raycasts against:

- circular static obstacles
- rectangular static obstacles

If practical, also support:

- vehicles as circles using vehicle radius
- dynamic actors as circles using actor radius

Keep raycast math pure and testable.

Suggested pure API:

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
  state: SimulationState,
  options: {
    includeStaticObstacles: boolean
    includeVehicles: boolean
    includeDynamicActors: boolean
  },
): RaycastHit2D | undefined
```

If this pure function depending on `SimulationState` becomes hard to test, split
shape extraction from intersection math:

```text
SimulationState -> CollisionShape2D[] / LidarRaycastShape2D[]
pure ray vs shapes
```

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

- Noise must be deterministic for a fixed seed, scenario, and simulation tick.
- Tests must not rely on global randomness.
- Default noise disabled unless scenario enables it.

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

Policy decisions to document:

- no-hit value: `Infinity` or `rangeMax`
- dropout value: `Infinity`, `NaN`, or `rangeMax`
- outlier sampling range

Prefer values that serialize cleanly in replay. If using `Infinity`, confirm
the replay serializer/parser preserves it or encode no-hit explicitly. JSON does
not preserve `Infinity`, so `rangeMax` or `null`-compatible encoding may be
safer.

Recommended first-pass policy:

- no hit => `rangeMax`
- dropout => `rangeMax`
- all `ranges[]` values finite

This keeps replay JSON simple.

---

## Rendering

Add renderer support after the scan exists in state.

Three renderer:

- Draw hit points and/or rays using Three.js primitives.
- Read from `state.lidarScans.toArray()`.
- Use centralized coordinate mapping helpers.
- Keep renderer cache keyed by scan `id`.
- Dispose objects when scans disappear.

Phaser renderer:

- Draw rays/hit points using Graphics.
- Read from `state.lidarScans.toArray()`.
- Respect viewport mapping.

Initial visual style:

- rays: faint cyan/blue lines
- hit points: small brighter dots
- optionally cap visible rays if performance is a concern

Renderer config can be simple initially:

```ts
{
  showRays: true,
  showHitPoints: true,
  rayColor: '#2a7bff',
  pointColor: '#00ffff',
  opacity: 0.35,
}
```

Do not expose UI controls in the first pass unless requested.

---

## Replay Contract

Lidar scans must be playback-safe.

Add to `SimulationFrameSnapshot`:

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

Replay should reproduce recorded noisy measurements exactly. It should not
rerun raycasts or regenerate random noise.

Backward compatibility:

- Old replay files without `lidarScans` still load.
- New field is optional.

---

## Future ROS2 LaserScan Output

Do not implement unless explicitly requested, but design so it is easy later.

Future adapter:

```text
LidarScan2D
  -> sensor_msgs/msg/LaserScan
```

Mapping:

- `header.frame_id = scan.frameId`
- `header.stamp = scan.timeSec`
- `angle_min = scan.angleMin`
- `angle_max = scan.angleMax`
- `angle_increment = scan.angleIncrement`
- `range_min = scan.rangeMin`
- `range_max = scan.rangeMax`
- `ranges = scan.ranges`
- `intensities = scan.intensities ?? []`

Keep this adapter in rosbridge infrastructure. The simulation layer must not
know `sensor_msgs/msg/LaserScan`.

---

## Tests Required

Add tests for:

1. Scenario parsing
   - accepts valid `sensors` block
   - rejects invalid `kind`
   - rejects duplicate or empty ids if that is the scenario policy
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
   - `src/simulation/sensors` imports no ROS/UI/renderer/infrastructure code.
   - ROS LaserScan adapter, if added later, lives under rosbridge
     infrastructure.

---

## Verification

Run:

```bash
npm test
npx eslint src/simulation src/ui src/app src/infrastructure/communication/rosbridge
npx tsc -b --noEmit
```

If `tsc` has pre-existing unrelated failures, report those exact files and
confirm new lidar files do not introduce additional TypeScript errors.

---

## Acceptance Criteria

The lidar feature is complete when:

- Scenario JSON can declare at least one `lidar2d` sensor.
- The simulation produces deterministic `LidarScan2D` values at the configured
  simulation-time rate.
- Noise parameters are configurable and tested.
- The latest scan is stored in `SimulationState.lidarScans`.
- Three.js and Phaser can visualize the scan.
- Replay snapshots and restores lidar scans.
- The implementation does not introduce ROS types into simulation or renderer
  code.
- Existing tests remain green.

---

## Future Work

After first implementation:

- Publish `LidarScan2D` as ROS2 `sensor_msgs/msg/LaserScan`.
- Add lidar UI controls for noise/rate/range.
- Add display plugin support for rendering external `LaserScan` topics.
- Add frame transform support for sensor frames when TF is available.
- Add raycast support through Rapier or another collision backend.
- Add intensity simulation.
- Add occlusion policies for vehicles/dynamic actors.
- Add multi-echo or 3D lidar if needed.

