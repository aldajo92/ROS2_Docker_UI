# Noisy Vehicle Pose ROS Publisher Agent Prompt

Use this prompt when asking an AI coding agent to add ROS 2 publishing of a
vehicle pose with Gaussian noise and covariance.

## Prompt

You are working in the `angy_sim_ros2` project.

Before coding, read and follow:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Topic_Support_Guide.md`
- `doc/Refactor/ScenarioConnectionsActionsDisplaysSchemaPrompt.md` if the
  scenario schema migration is already in progress or complete.

## Goal

Add support for publishing a vehicle's **noisy measured pose** to ROS 2 through
rosbridge.

This feature is simulated sensor/telemetry output:

```text
VehicleEntity ground-truth pose
  -> noisy pose sensor/model
  -> pose with covariance message
  -> rosbridge adapter
  -> Transport.publish(...)
```

The simulator must keep ground truth and measurement separate.

## Required Behavior

Given a vehicle entity, publish a ROS 2 pose message at a configured rate:

```text
/sim/ego/noisy_pose
geometry_msgs/msg/PoseWithCovarianceStamped
```

The published pose must:

- Read the true pose from `SimulationState`.
- Add configurable Gaussian noise to `x`, `y`, and `yaw`.
- Include covariance values derived from the configured standard deviations.
- Publish at a simulation-time rate, driven by `PeriodicPublisher`.
- Stop publishing when disabled or when the transport disconnects.
- Do nothing when the target vehicle is missing or not a vehicle.

The feature must not:

- Mutate `VehicleEntity.pose`.
- Mutate `VehicleEntity.controls`.
- Mutate `SimulationState` from transport callbacks.
- Add ROS message shapes to `src/simulation/`.
- Import `roslib`, rosbridge infrastructure, DOM, React, Three.js, or Phaser
  into `src/simulation/` or `src/math/`.
- Use `Math.random()` directly if deterministic tests/replay behavior depend
  on noise samples.

## Recommended ROS Message

Use:

```text
geometry_msgs/msg/PoseWithCovarianceStamped
```

Reason:

- It carries pose.
- It carries a standard ROS covariance matrix.
- It is a good local-frame pose measurement abstraction.

Do not use `PoseStamped` for this feature because it cannot represent
uncertainty.

Future options, not required in this task:

- `nav_msgs/msg/Odometry` for pose + twist + covariance.
- `sensor_msgs/msg/NavSatFix` for GPS-like global measurements.

## Internal Message Contract

Add a simulator-owned JSON-friendly message under
`src/simulation/communication/messages/`, for example:

```ts
export interface SimPoseWithCovarianceMessage {
  header: {
    stampSec: number
    frameId: string
  }
  childFrameId?: string
  pose: {
    x: number
    y: number
    z?: number
    yaw: number
  }
  covariance: number[] // length 36, row-major [x, y, z, roll, pitch, yaw]
  source: {
    vehicleId: string
    measurement: 'noisy_pose'
  }
}
```

Keep this message free of ROS-specific classes or imports.

## Noise Model

Add a pure deterministic noise helper under `src/simulation/sensors/` or a
nearby simulation-owned folder:

```ts
export interface GaussianPoseNoise2DConfig {
  stdDevX: number
  stdDevY: number
  stdDevYaw: number
  seed?: number
}
```

Behavior:

```text
x_measured   = x_true   + N(0, stdDevX)
y_measured   = y_true   + N(0, stdDevY)
yaw_measured = yaw_true + N(0, stdDevYaw)
```

Requirements:

- Validate all standard deviations are finite and non-negative.
- Use a seeded RNG when `seed` is provided.
- Keep the RNG/model deterministic for tests.
- Keep the noise model independent of ROS, transport, UI, and rendering.
- Wrap noisy yaw with the existing angle wrapping helper.

Covariance mapping for ROS `PoseWithCovariance`:

```text
covariance[0]  = stdDevX^2      // x
covariance[7]  = stdDevY^2      // y
covariance[35] = stdDevYaw^2    // yaw
```

The matrix is 6x6 row-major over:

```text
[x, y, z, roll, pitch, yaw]
```

For unused 2D dimensions (`z`, `roll`, `pitch`), choose one clear policy and
document it:

- zero variance if consumers should ignore them, or
- a large variance if consumers should treat them as unknown.

Prefer a conservative documented default.

## Bridge / Publisher Design

Add a publisher bridge in `src/simulation/communication/bridges/`, for example:

```ts
VehicleNoisyPosePublisherBridge
```

Responsibilities:

- Read `SimulationEngine` / `SimulationState` when `publishOnce()` is called.
- Find the configured vehicle.
- Build a `SimPoseWithCovarianceMessage`.
- Pass it to a `MessageAdapter`.
- Publish it through the generic `Transport`.

It must not:

- Import rosbridge infrastructure.
- Import ROS message types.
- Mutate the vehicle.
- Own wall-clock timers.

Publishing cadence must be handled with:

```text
PeriodicPublisher(rate period, () => bridge.publishOnce())
CommunicationSystem
```

This keeps publishing tied to simulation time:

- paused simulation -> no publishes
- fast-forward -> faster publishes
- step once -> deterministic publish accumulation

## Rosbridge Adapter

Add the ROS-specific adapter under:

```text
src/infrastructure/communication/rosbridge/adapters/
```

Example:

```ts
SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter
```

It should convert the internal message into a JSON shape compatible with:

```text
geometry_msgs/msg/PoseWithCovarianceStamped
```

Required ROS fields:

```json
{
  "header": {
    "stamp": {
      "sec": 0,
      "nanosec": 0
    },
    "frame_id": "map"
  },
  "pose": {
    "pose": {
      "position": { "x": 0, "y": 0, "z": 0 },
      "orientation": { "x": 0, "y": 0, "z": 0, "w": 1 }
    },
    "covariance": []
  }
}
```

Yaw-to-quaternion conversion for planar yaw:

```text
qz = sin(yaw / 2)
qw = cos(yaw / 2)
qx = 0
qy = 0
```

Keep ROS naming (`frame_id`) inside the rosbridge adapter only.

## Scenario Configuration

If the new `connections/actions/displays` schema is in use, add a
publisher/output block rather than overloading `actions` or `displays`.

Recommended future shape:

```json
{
  "publishers": [
    {
      "source": {
        "connection": "rosbridge"
      },
      "topic": "/sim/ego/noisy_pose",
      "messageType": "geometry_msgs/msg/PoseWithCovarianceStamped",
      "vehicleId": "ego",
      "frameId": "map",
      "childFrameId": "ego",
      "rateHz": 20,
      "enabled": true,
      "noise": {
        "model": "gaussian2d",
        "stdDev": {
          "x": 0.05,
          "y": 0.05,
          "yaw": 0.02
        },
        "seed": 1234
      }
    }
  ]
}
```

If the scenario schema migration is not ready yet, do not force a full schema
migration as part of this task. Instead:

- Add the pure simulation/bridge/adapter pieces.
- Wire a minimal hardcoded or app-configured publisher only for development,
  or stop after the lower-level tests.
- Document the intended scenario shape in `doc/Topic_Support_Guide.md`.

Do not add this as an `action`; it is outbound telemetry, not manipulation.
Do not add this as a `display`; it is published output, not viewport rendering.

## App Wiring

Wire the publisher in `src/app/CommunicationProvider.tsx` only if the selected
transport/connection is rosbridge and the publisher is enabled.

Rules:

- Register the ROS topic type with `RoslibRosbridgeTransport.setTopicType`.
- Create a bridge with the generic `Transport`.
- Drive it through `PeriodicPublisher`.
- Add it to the existing `CommunicationSystem` publisher list.
- Do not create publishers implicitly just because rosbridge is connected.
- Do not reconnect rosbridge when enabling/disabling this publisher.

If adding a UI control, keep it generic and app-layer only. Do not put this
inside renderer components.

## Required Tests

Add focused tests before implementation is considered complete.

### Noise / Sensor Tests

Test the pure noise model:

- zero std dev returns exact ground-truth pose
- nonzero std dev with a fixed seed is deterministic
- yaw noise is wrapped
- invalid std dev values are rejected
- covariance contains `x`, `y`, and `yaw` variances in indices `0`, `7`, `35`
- input pose/state is not mutated

### Internal Message / Bridge Tests

Test `VehicleNoisyPosePublisherBridge`:

- publishes nothing before `start()` if bridge has lifecycle gating
- publishes nothing for missing vehicle
- publishes nothing for non-vehicle entity
- publishes one message for a valid vehicle
- uses simulation time for timestamp
- uses configured frame ids
- passes through covariance
- does not mutate vehicle pose or controls

### Rosbridge Adapter Tests

Test the ROS adapter:

- converts stamp seconds to `{ sec, nanosec }`
- converts `frameId` to `header.frame_id`
- converts planar yaw to quaternion
- emits a 36-element covariance array
- rejects malformed internal messages if adapter validates input

### Communication / App Wiring Tests

If app wiring is included:

- disabled publisher creates no bridge/publisher
- enabled publisher registers topic type
- enabled publisher adds a `PeriodicPublisher`
- selecting rosbridge alone does not create the noisy pose publisher
- toggling this publisher does not reset topic discovery or reconnect rosbridge

## Manual Acceptance Criteria

In the running app:

1. Load a scenario with `ego`.
2. Enable noisy pose publishing to rosbridge.
3. Echo `/sim/ego/noisy_pose`.
4. Confirm messages publish at the configured rate while simulation runs.
5. Pause simulation; messages stop.
6. Resume simulation; messages continue.
7. Confirm published position differs slightly from ground truth when noise is
   nonzero.
8. Confirm covariance matches configured standard deviations.
9. Set noise std dev to zero; published pose matches ground truth.
10. Confirm vehicle motion/rendering is unchanged by publishing.

## Files Likely Affected

Likely:

- `src/simulation/communication/messages/*`
- `src/simulation/sensors/*`
- `src/simulation/communication/bridges/*`
- `src/infrastructure/communication/rosbridge/adapters/*`
- `src/app/CommunicationProvider.tsx` if app wiring is included
- `src/simulation/scenarios/Scenario.ts` and `ScenarioLoader.ts` if scenario
  config is included
- relevant tests beside each module
- `doc/Topic_Support_Guide.md`
- `doc/Architecture.md` if this becomes a documented extension point

Avoid unless truly necessary:

- `VehicleEntity.ts`
- `VehicleCommandSystem.ts`
- renderer files
- collision files
- recording/replay files
- math primitives, except using existing angle helpers

## Final Response Requirements

After implementation, report:

1. Files changed.
2. Whether scenario config was included or deferred.
3. Message type and topic used.
4. Noise/covariance behavior.
5. Tests added/updated and results.
6. Architecture compliance summary.
7. Any limitations, especially around deterministic noise and replay.
