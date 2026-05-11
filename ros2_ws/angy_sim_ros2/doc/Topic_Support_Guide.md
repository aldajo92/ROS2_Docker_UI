# ROS 2 Topic Support Guide

This guide explains how to add new ROS 2 topic support without breaking the
simulator's core invariants. Read it together with:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Plugins.md`

`Plugins.md` is the detailed recipe for display plugins. This document is the
higher-level topic-support checklist for both:

- **Display topics**: topics that draw artifacts in the viewport.
- **Control topics**: topics that manipulate simulation behavior.

## Core Rule

Selecting a transport is never enough to activate a topic.

Every supported topic must become active through one of these explicit paths:

1. The user selects it in `Ros2TopicsPanel`.
2. The loaded scenario declares it in the Scenario Editor JSON.

No hardcoded fallback topic may create a subscription, command bridge, rendered
artifact, or state mutation.

## Topic Categories

### Display Topics

Display topics visualize external data. Examples:

- `nav_msgs/msg/Path` -> `Path2D`
- `geometry_msgs/msg/PoseArray` -> `PoseArray2D`

Display topics must:

- Convert ROS messages into simulator-owned JSON-safe artifacts.
- Push updates into a simulation-side queue.
- Let a `SimulationSystem` drain the queue during the tick.
- Store state in `SimulationState`.
- Let renderers read that state.
- Sync selection and supported style fields into
  `displays[]` in the Scenario Editor.

Display topics must not:

- Mutate `SimulationState` from a transport callback.
- Import ROS, rosbridge, `roslib`, React, Three.js, or Phaser into
  `src/simulation/`.
- Call renderer code from the transport layer.
- Store actual artifact data only in renderer state.

### Control Topics

Control topics change simulation behavior. The current example is:

- `geometry_msgs/msg/Twist` -> `VehicleCommand`

Control topics must:

- Be opt-in per topic and per target entity.
- Sync selection into `actions[]` in the Scenario Editor.
- Use canonical simulation commands or queues.
- Respect tick boundaries.
- Start and stop only the specific bridge/subscription for that topic.

Control topics must not:

- Mutate entities directly from React, rosbridge, transport callbacks, or UI
  event handlers.
- Create implicit subscriptions just because the transport is connected.
- Reconnect the whole transport when one control topic is toggled.
- Leave stale sticky commands without an explicit restore policy.

### Publisher Topics

Publisher topics send simulation state outward to external consumers. Examples:

- `geometry_msgs/msg/PoseWithCovarianceStamped` <- vehicle noisy pose

Publisher topics must:

- Be declared in `publishers[]` in the scenario — never hardcoded.
- Run at a configurable `rateHz`, driven by `PeriodicPublisher` inside
  `CommunicationSystem`.
- Read simulation state read-only; never mutate `SimulationState`.
- Convert internal state through a `MessageAdapter` before transport publish.
- Keep ROS wire-format names (`frame_id`, `nanosec`, etc.) inside the adapter
  only — not in the simulation or bridge layer.
- Sync their lifecycle via `CommunicationSystem.addPublisher` /
  `removePublisher` so scenario changes do not reconnect the transport.

Publisher topics must not:

- Publish without an explicit scenario `publishers[]` entry.
- Import ROS, rosbridge, `roslib`, React, Three.js, or Phaser into
  `src/simulation/`.
- Mutate `SimulationState` or entity fields.

## Current Supported Topics

| ROS 2 message type | Category | Scenario block | Runtime path |
|---|---|---|---|
| `nav_msgs/msg/Path` | Display (inbound) | `displays[]` | `RosPathToPath2DAdapter` -> display plugin -> `ExternalPathUpdateQueue` -> `ExternalPathRenderSystem` -> `state.paths` |
| `geometry_msgs/msg/PoseArray` | Display (inbound) | `displays[]` | `RosPoseArrayToPoseArray2DAdapter` -> display plugin -> `ExternalPoseArrayUpdateQueue` -> `ExternalPoseArrayRenderSystem` -> `state.poseArrays` |
| `geometry_msgs/msg/Twist` | Control (inbound) | `actions[]` | `RosTwistToVehicleCommandAdapter` -> `VehicleCommandTopicBridge` -> `VehicleCommandQueue` -> `VehicleCommandSystem` -> `VehicleEntity.setCommand(...)` |
| `geometry_msgs/msg/PoseWithCovarianceStamped` | Publisher (outbound) | `publishers[]` | `GaussianPoseNoise2D` -> `VehicleNoisyPosePublisherBridge` -> `SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter` -> rosbridge transport |

## Scenario Editor Contract

Every selected supported topic must be reflected in the Scenario Editor.

All external connections are declared under `connections`, keyed by a
user-chosen id. The `kind` field identifies the transport; `url` is optional.

Display selections go into `displays[]`:

```json
{
  "connections": {
    "rosbridge": { "kind": "rosbridge" }
  },
  "displays": [
    {
      "source": {
        "connection": "rosbridge",
        "topic": "/circle_path",
        "messageType": "nav_msgs/msg/Path"
      },
      "style": {
        "color": "#f0c14a",
        "thickness": 2
      }
    }
  ]
}
```

Control selections go into `actions[]`. For Twist:

```json
{
  "connections": {
    "rosbridge": { "kind": "rosbridge" }
  },
  "actions": [
    {
      "source": {
        "connection": "rosbridge",
        "topic": "/cmd_vel",
        "messageType": "geometry_msgs/msg/Twist"
      },
      "target": { "kind": "vehicle", "id": "ego" },
      "enabled": true
    }
  ]
}
```

Outbound publisher selections go into `publishers[]`:

```json
{
  "connections": {
    "rosbridge": { "kind": "rosbridge" }
  },
  "publishers": [
    {
      "source": { "connection": "rosbridge" },
      "topic": "/sim/ego/noisy_pose",
      "messageType": "geometry_msgs/msg/PoseWithCovarianceStamped",
      "vehicleId": "ego",
      "frameId": "map",
      "rateHz": 20,
      "noise": {
        "model": "gaussian2d",
        "stdDev": { "x": 0.05, "y": 0.05, "yaw": 0.02 },
        "seed": 1234
      }
    }
  ]
}
```

Rules:

- Selecting a topic writes the scenario entry.
- Deselecting a display topic removes it from `displays[]`.
- Disabling a control topic may preserve the entry with `enabled: false` when
  that is useful for a lossless UI round trip.
- Loading a scenario applies its selected topics back into the live UI state.
- Invalid editor JSON must not be overwritten by auto-sync helpers.
- Auto-sync helpers must replace only their own scenario block and preserve
  sibling fields.

## Lifecycle Separation

Transport lifecycle and topic lifecycle are different things.

The transport lifecycle owns:

- rosbridge connection
- topic discovery capability
- echo capability
- renderable topic capability
- outbound clock publishing

Topic lifecycle owns:

- selected display-topic subscriptions
- selected control-topic subscriptions
- per-topic adapters
- per-topic cleanup

Changing one topic selection must not:

- reconnect rosbridge
- reset topic discovery
- close echo sessions unrelated to that topic
- clear renderable-topic selections unrelated to that topic
- recreate the entire `Ros2TopicsPanel`

Expected log shape when toggling a Twist topic:

```text
[CommunicationProvider] twist bridge started: topic="/cmd_vel" vehicleId="ego"
[CommunicationProvider] twist bridges stopped (count=1)
```

Unexpected log shape:

```text
transport effect cleanup
topic discovery reset
connect failed / reconnect
```

## Display Topic Recipe

Use this path for topics that draw or annotate the world.

1. Define a JSON-safe artifact under `src/simulation/<artifact>/`.
2. Add a registry on `SimulationState` if the artifact persists across ticks.
3. Add an external update queue.
4. Add a `SimulationSystem` that drains the queue into `SimulationState`.
5. Clear the registry in `SimulationEngine.reset()` when the artifact is
   reset-scoped.
6. Add a display plugin under `src/app/display/plugins/`.
7. Register the plugin in `DisplayPluginRegistry`.
8. Add a ROS adapter under
   `src/infrastructure/communication/rosbridge/adapters/`.
9. Add a ROS display binding under
   `src/infrastructure/communication/rosbridge/display/`.
10. Add the message type to `RENDERABLE_TOPIC_WHITELIST`.
11. Add renderer support for Three.js and/or Phaser.
12. Add Scenario Editor round-trip support for every visual config field.
13. Add replay snapshot/restore support unless deliberately deferred and
    documented.

Display topic tests should cover:

- adapter validation and conversion
- queue coalescing and remove semantics
- system drain into `SimulationState`
- reset clears state
- display plugin config application
- scenario parse and editor sync
- renderer read-only behavior
- architecture boundary tests

## Control Topic Recipe

Use this path for topics that affect entities, commands, or simulation behavior.

1. Define the scenario interaction shape in `src/simulation/scenarios/Scenario.ts`.
2. Parse and validate it in `ScenarioLoader`.
3. Define app-layer binding state in `src/app/`.
4. Make `Ros2TopicsPanel` expose an explicit opt-in UI for the topic.
5. Sync the binding into the Scenario Editor.
6. Apply scenario-declared bindings on scenario load.
7. Convert the ROS wire message in an infrastructure adapter.
8. Push a canonical command or mailbox update into simulation.
9. Let a simulation system apply the change during the tick.
10. Keep bridge lifecycle separate from transport lifecycle.
11. Define a deselect/disable policy.

Control topic tests should cover:

- transport selection alone creates no control subscription
- selected enabled binding creates exactly one bridge
- disabled binding creates no bridge
- toggling a binding does not reconnect transport or reset topic discovery
- incoming messages go through the canonical queue/system path
- deselect restores or releases control according to the documented policy
- Scenario Editor JSON round-trips both enabled and disabled bindings

## Twist Control Policy

Twist is the template for future control topics.

Runtime flow:

```text
ROS 2 Twist message
  -> RosTwistToVehicleCommandAdapter
  -> VehicleCommandTopicBridge
  -> VehicleCommandQueue
  -> VehicleCommandSystem
  -> VehicleEntity.setCommand(...)
```

Rules:

- No `/cmd_vel -> ego` fallback exists.
- `enabled !== false` means active.
- Empty or missing `actions[]` means no Twist bridge.
- `VehicleEntity.setCommand(...)` is sticky: the last command remains until a
  new command changes it.
- Deselecting a Twist binding must explicitly define what happens to the
  vehicle after external control stops.

Current deselect policy:

- Stop the Twist bridge for that topic.
- Queue a restore command for the target vehicle.
- Restore from the loaded scenario vehicle `controls` when present.
- Restore to zero velocity when the scenario has no vehicle controls.
- Do not call `vehicle.setControls(...)` or mutate `VehicleEntity` directly
  from UI/provider code.

## Common Failure Modes

### Implicit Topic Activation

Bad:

```text
transport = rosbridge
bindings = []
runtime creates /cmd_vel -> ego anyway
```

Correct:

```text
transport = rosbridge
bindings = []
runtime creates zero control bridges
```

### Sticky Commands After Deselect

Bad:

```text
/cmd_vel sends v=1.0
user deselects /cmd_vel
vehicle keeps v=1.0 forever
```

Correct:

```text
/cmd_vel sends v=1.0
user deselects /cmd_vel
UI/app queues restore command from scenario controls
VehicleCommandSystem applies it on the next tick
```

### Display Artifact Survives Reset

Bad:

```text
SimulationEngine.reset()
state.paths.clear()
state.trajectories.clear()
state.poseArrays not cleared
```

Correct:

```text
SimulationEngine.reset()
clears every reset-scoped registry, including newly added artifacts
```

### Toggle Reconnects Transport

Bad:

```text
toggle /cmd_vel
transport effect cleanup
topic discovery resets
rosbridge reconnects
```

Correct:

```text
toggle /cmd_vel
only the Twist bridge effect starts/stops that bridge
```

### Scenario Editor Drift

Bad:

```text
user selects a topic
viewport changes
Scenario Editor does not change
downloaded scenario cannot reproduce the selection
```

Correct:

```text
user selects a supported topic
Scenario Editor receives the matching visualization or interaction entry
downloaded scenario reproduces the selection on load
```

## Before Adding a Topic

Answer these questions first:

1. Is the topic display, control, or both?
2. What simulator-owned artifact or command does it produce?
3. Where is its Scenario Editor entry stored?
4. What happens when the topic is deselected?
5. What happens on `SimulationEngine.reset()`?
6. Does the topic need replay snapshot/restore support?
7. Which lifecycle owns its subscription?
8. Which tests prove that selecting the transport alone does nothing?
9. Which tests prove that the Scenario Editor round-trip works?
10. Which architecture test prevents forbidden imports?

## Required Verification

Run the targeted tests for the area you changed, then the broad checks:

```bash
npm test
npx tsc -b --noEmit
npx eslint src/app src/ui src/simulation src/infrastructure/communication/rosbridge
```

When debugging lifecycle bugs, enable or add logs that distinguish:

- transport connect/disconnect
- topic discovery refresh/reset
- display-topic select/deselect
- control-topic bridge start/stop
- command queue restore behavior

Logs should prove which lifecycle changed. They should not become the fix.
