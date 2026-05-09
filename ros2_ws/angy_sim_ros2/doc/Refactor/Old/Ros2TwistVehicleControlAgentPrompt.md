# ROS2 Twist Vehicle Control Agent Prompt

Use this prompt when adding scenario-declared ROS2 Twist control bindings and
the corresponding vehicle-selection UI in the ROS2 Topics panel.

This prompt assumes:

- `doc/Architecture.md` and `doc/Development_Guide.md` are the source of truth.
- `src/simulation` owns deterministic simulator state and JSON-safe scenario
  data.
- `src/app` owns UI composition and scenario-load orchestration.
- `src/infrastructure/communication/rosbridge` owns ROS wire-format and
  transport-specific code.
- `src/ui/Ros2TopicsPanel.tsx` owns the ROS2 topic-list UI.
- Existing `geometry_msgs/msg/Twist` handling should be reused when possible.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to let users associate ROS2 `geometry_msgs/msg/Twist` topics with
vehicle entities, both:

1. declaratively through scenario JSON, and
2. interactively through a dropdown in `Ros2TopicsPanel`.

---

## Goal

Allow a scenario JSON file to declare that a ROS2 Twist topic controls a
specific vehicle entity.

Also, when the ROS2 topic list contains a topic of type
`geometry_msgs/msg/Twist`, show a dropdown that lists the controllable vehicle
entities from the active scenario.

Selecting a vehicle in that dropdown should define which vehicle receives
commands from that Twist topic.

---

## Important Schema Decision

Do **not** include `messageType` inside each JSON binding.

Reason:

The field name `ros2TwistControls` already defines the message contract. Adding:

```json
"messageType": "geometry_msgs/msg/Twist"
```

would be redundant and would incorrectly suggest that other message types are
supported by this block.

Also do **not** include a configurable `mapping` field in the first
implementation.

Reason:

The initial implementation supports a fixed and explicit mapping:

```text
Twist.linear.x  -> VehicleCommand.v / linearVelocity
Twist.angular.z -> VehicleCommand.w / angularVelocity
```

---

## Scenario JSON Proposal

Add `ros2TwistControls` under `interaction`:

```json
{
  "interaction": {
    "ros2TwistControls": [
      {
        "topic": "/cmd_vel",
        "vehicleId": "ego",
        "enabled": true,
        "scale": {
          "v": 1.0,
          "w": 1.0
        },
        "limits": {
          "maxForwardSpeed": 2.0,
          "maxReverseSpeed": 1.0,
          "maxAngularSpeed": 2.5
        },
        "timeoutSec": 0.5,
        "onTimeout": "stop"
      }
    ]
  }
}
```

### Field Semantics

- `topic`: ROS2 topic name to subscribe to, e.g. `/cmd_vel`.
- `vehicleId`: id of the scenario `vehicle` entity controlled by this topic.
- `enabled`: optional, defaults to `true`.
- `scale.v`: optional multiplier for `Twist.linear.x`.
- `scale.w`: optional multiplier for `Twist.angular.z`.
- `limits.maxForwardSpeed`: optional positive clamp for positive `v`.
- `limits.maxReverseSpeed`: optional positive clamp for negative `v`.
- `limits.maxAngularSpeed`: optional positive clamp for absolute `w`.
- `timeoutSec`: optional positive timeout for stale commands.
- `onTimeout`: optional timeout action. First implementation should support
  `"stop"`.

### Fixed Mapping

The runtime conversion is fixed:

```text
v = Twist.linear.x  * (scale.v ?? 1)
w = Twist.angular.z * (scale.w ?? 1)
```

Then apply limits when present.

When `onTimeout` is `"stop"` and no message has arrived within `timeoutSec`,
enqueue a zero command for the bound vehicle.

---

## UI Requirement: ROS2 Topics Dropdown

When a row in `Ros2TopicsPanel` has:

```text
topic.type === "geometry_msgs/msg/Twist"
```

show a dropdown that allows the user to select which vehicle entity that topic
controls.

### Dropdown Behavior

1. Only show the dropdown for `geometry_msgs/msg/Twist` topics.
2. The dropdown options must come from the active scenario's vehicle entities.
3. Each option value should be the vehicle entity id.
4. If there are no vehicle entities:
   - show the dropdown disabled, or
   - show a compact hint like `No vehicles`.
5. Selecting a vehicle should update the app-level Twist binding for that topic.
6. The selected value should stay visible while the scenario remains loaded.
7. If the selected vehicle disappears after loading another scenario:
   - clear the selection, or
   - fallback to the first available vehicle.
   - Choose one behavior and document it.
8. The dropdown should not appear for visualization-only topics such as:
   - `nav_msgs/msg/Path`
   - `geometry_msgs/msg/PoseArray`
9. The dropdown should not depend on the renderable-topic checkbox. Twist
   control is interaction/control, not visualization.

### Suggested UI Shape

In the row for `/cmd_vel`:

```text
▶ /cmd_vel geometry_msgs/msg/Twist [Vehicle: ego ▼] Echo
```

or, if the row is too narrow:

```text
▶ /cmd_vel geometry_msgs/msg/Twist Echo
  Vehicle: [ego ▼]
```

Prefer a layout that does not break the existing topic-name/type/echo row on
small inspector widths.

---

## Architecture Requirements

Follow these rules strictly:

- Do not put ROS-specific imports in `src/simulation` or `src/math`.
- Do not import `roslib`, rosbridge, React, Three.js, Phaser, or DOM APIs into
  simulation core.
- Keep ROS wire-format knowledge in infrastructure/adapters.
- Keep simulation command application transport-agnostic.
- External ROS callbacks must not mutate `SimulationState` directly.
- ROS callbacks should enqueue vehicle commands through the existing
  `VehicleCommandQueue`.
- Renderers must remain read-only.
- Do not change physics, entities, collision logic, replay logic, or renderer
  behavior.
- Keyboard control behavior must remain unchanged unless explicitly documented.
- If both keyboard and ROS Twist control target the same vehicle, define and
  document precedence.

---

## Existing Code To Inspect First

Before implementing, inspect and reuse existing code where possible:

- `src/infrastructure/communication/rosbridge/adapters/RosTwistToVehicleCommandAdapter.ts`
- `src/simulation/communication/bridges/VehicleCommandTopicBridge.ts`
- `src/simulation/commands/VehicleCommandQueue.ts`
- `src/simulation/commands/VehicleCommandSystem.ts`
- `src/app/CommunicationProvider.tsx`
- `src/ui/Ros2TopicsPanel.tsx`
- `src/simulation/scenarios/Scenario.ts`
- `src/simulation/scenarios/ScenarioLoader.ts`
- `src/app/App.tsx`

Important current behavior to verify:

- There may already be a hardcoded `/cmd_vel -> vehicleId` bridge.
- `RosTwistToVehicleCommandAdapter` may already route Twist messages to a
  configured `vehicleId`.
- `CommunicationProvider` may already construct a bridge with a single
  `vehicleId`.

Prefer extending the existing path instead of creating duplicate Twist-control
infrastructure.

---

## Suggested Implementation

### 1. Extend Scenario Types

Add:

```ts
export interface Ros2TwistControlBinding {
  topic: string
  vehicleId: string
  enabled?: boolean
  scale?: {
    v?: number
    w?: number
  }
  limits?: {
    maxForwardSpeed?: number
    maxReverseSpeed?: number
    maxAngularSpeed?: number
  }
  timeoutSec?: number
  onTimeout?: "stop"
}
```

Then add it under:

```ts
export interface ScenarioInteractionConfig {
  keyboardControl?: KeyboardControlScenarioConfig
  ros2TwistControls?: Ros2TwistControlBinding[]
}
```

Keep the shape JSON-safe.

Do not include `messageType`.

### 2. Extend ScenarioLoader

Parse and validate `interaction.ros2TwistControls`.

Validation rules:

- `ros2TwistControls`, when present, must be an array.
- `topic` must be a non-empty string.
- `vehicleId` must be a non-empty string.
- `enabled`, when present, must be boolean.
- `scale.v` and `scale.w`, when present, must be finite numbers.
- limits, when present, must be finite positive numbers.
- `timeoutSec`, when present, must be a finite positive number.
- `onTimeout`, when present, must be `"stop"`.
- `messageType` is not required and should not be part of the schema.

Preserve backward compatibility when `interaction.ros2TwistControls` is absent.

### 3. Add App-Level Binding State

Add a UI/app-level state representing Twist topic bindings, for example:

```ts
type Ros2TwistTopicBindingState = {
  topic: string
  vehicleId: string
  enabled: boolean
  scale?: { v?: number; w?: number }
  limits?: {
    maxForwardSpeed?: number
    maxReverseSpeed?: number
    maxAngularSpeed?: number
  }
  timeoutSec?: number
  onTimeout?: "stop"
}
```

Apply scenario-declared bindings when a scenario loads.

When the user changes the dropdown in `Ros2TopicsPanel`, update this state.

Decide whether UI changes should immediately sync back into the Scenario Editor
JSON. Preferred behavior:

- yes, eventually sync to `interaction.ros2TwistControls`,
- but keep this scoped and tested to avoid clobbering manual editor edits.

If JSON sync is deferred, document it clearly.

### 4. Pass Vehicle Options Into Ros2TopicsPanel

Derive controllable entities from the active scenario:

```ts
const controllableVehicles = currentScenarioSpec.entities
  .filter((e) => e.kind === "vehicle")
  .map((e) => ({ id: e.id, label: e.id }))
```

Pass props to `Ros2TopicsPanel`, for example:

```ts
twistControlVehicles={controllableVehicles}
twistControlBindings={twistControlBindings}
onTwistControlBindingChange={handleTwistControlBindingChange}
```

Keep `Ros2TopicsPanel` generic enough that it still does not import simulation
entities directly.

### 5. Update Ros2TopicsPanel

Add constants:

```ts
const TWIST_MESSAGE_TYPE = "geometry_msgs/msg/Twist"
```

For each topic row:

- if `topic.type === TWIST_MESSAGE_TYPE`, render a vehicle dropdown.
- dropdown value comes from binding state for that topic.
- options come from `twistControlVehicles`.
- `onChange` calls `onTwistControlBindingChange(topic.name, vehicleId)`.

Do not make Twist topics renderable just because they are controllable. Twist
control and topic visualization are separate capabilities.

### 6. Connect Runtime Twist Subscriptions

Update the communication layer so configured Twist topic bindings drive vehicle
commands.

Preferred approach:

- one `VehicleCommandTopicBridge` per enabled `(topic, vehicleId)` binding.
- one `RosTwistToVehicleCommandAdapter` per bridge, constructed with the
  binding's `vehicleId`.
- reuse the existing `VehicleCommandQueue`.

If there is currently a hardcoded `/cmd_vel` bridge:

- replace it with scenario/app-driven bindings, or
- keep it only as a backward-compatible fallback when no scenario binding is
  configured.

Document the chosen behavior.

### 7. Scale, Limits, Timeout

If the first implementation includes scale/limits/timeout:

- apply scale and limits either in the adapter or in a small wrapper around the
  adapter.
- keep ROS wire-shape validation in infrastructure.
- keep live timeout bookkeeping runtime-only.

If scale/limits/timeout are deferred:

- still parse them in scenario JSON only if they are intentionally supported.
- otherwise omit them from the first schema.
- document the deferral.

Recommended first implementation:

- parse and support `scale`.
- parse and support `limits`.
- support `timeoutSec` + `onTimeout: "stop"` only if there is already a clean
  runtime scheduling point.
- if timeout is not clean yet, defer it explicitly.

---

## Scenario Editor Round-Trip

The Scenario Editor must preserve `interaction.ros2TwistControls`.

If dropdown changes should sync into JSON, then update the same editor-sync
pattern used by visualization topics, but for `interaction.ros2TwistControls`.

Tests must cover:

- loading JSON with `ros2TwistControls` preserves it.
- changing dropdown updates app state.
- if JSON sync is implemented, changing dropdown updates the Scenario Editor
  JSON.
- if JSON sync is deferred, the UI must not silently pretend it was persisted.

---

## Documentation Updates

Update `doc/Architecture.md` or `doc/Development_Guide.md` with a short note:

- `interaction.ros2TwistControls` is scenario-declared control config.
- It is not visualization config.
- It always means `geometry_msgs/msg/Twist`.
- ROS wire handling stays in infrastructure.
- Simulation core receives transport-agnostic vehicle commands through
  `VehicleCommandQueue`.

---

## Tests To Add Or Update

### ScenarioLoader Tests

- parses one valid `interaction.ros2TwistControls` entry.
- accepts missing field.
- rejects non-array `ros2TwistControls`.
- rejects empty `topic`.
- rejects empty `vehicleId`.
- rejects invalid `enabled`.
- rejects invalid `scale`.
- rejects invalid `limits`.
- rejects invalid `timeoutSec`.
- rejects unsupported `onTimeout`.
- confirms `messageType` is not required.

### Ros2TopicsPanel Tests

- renders a vehicle dropdown for `geometry_msgs/msg/Twist` topics.
- does not render dropdown for non-Twist topics.
- dropdown lists vehicle ids passed via props.
- dropdown is disabled or shows a hint when there are no vehicles.
- selecting a vehicle calls the binding-change callback with topic name and
  vehicle id.
- Twist dropdown does not depend on renderable-topic checkbox state.
- existing Path and PoseArray visualization controls still work.

### Adapter / Bridge Tests

- `Twist.linear.x` becomes vehicle command linear velocity.
- `Twist.angular.z` becomes vehicle command angular velocity.
- adapter uses the configured `vehicleId`.
- scale is applied if implemented.
- limits clamp values if implemented.
- malformed Twist messages still fail clearly.

### Runtime Wiring Tests

- loading a scenario with one Twist binding creates/subscribes the expected
  bridge.
- incoming Twist enqueues a command for the configured vehicle id.
- changing dropdown changes the target vehicle for subsequent commands.
- cleanup removes old subscriptions when scenario or transport changes.
- hardcoded `/cmd_vel` behavior is removed or documented as fallback.

### Regression Tests

- keyboard control still works.
- renderers are unaffected.
- replay/recording behavior is unchanged unless explicitly extended.
- no forbidden imports are introduced.

---

## Pre-Implementation Validation

Before coding, explicitly verify:

1. Existing `/cmd_vel` bridge behavior in `CommunicationProvider`.
2. Existing `RosTwistToVehicleCommandAdapter` capabilities.
3. Existing vehicle command queue/system order.
4. How keyboard control and external commands interact today.
5. Where active scenario vehicle ids are available in `App.tsx`.
6. Whether Scenario Editor JSON sync should be implemented in this change or
   deferred.

---

## Validation Commands

Run focused tests:

```bash
node_modules/.bin/vitest run src/simulation/scenarios/ScenarioLoader.test.ts
node_modules/.bin/vitest run src/ui/Ros2TopicsPanel.test.tsx
node_modules/.bin/vitest run src/infrastructure/communication/rosbridge/adapters/RosTwistToVehicleCommandAdapter.test.ts
```

Then run:

```bash
node_modules/.bin/vitest run
npx tsc --noEmit
```

---

## Report Back

After implementing, report:

1. Final scenario JSON schema.
2. Whether `messageType` and `mapping` were intentionally omitted.
3. How the dropdown gets the list of vehicle entities.
4. How topic-to-vehicle selections are stored.
5. Whether dropdown changes sync back into Scenario Editor JSON.
6. How runtime Twist subscriptions are created.
7. Command precedence between keyboard and ROS Twist control.
8. Timeout behavior, or whether timeout was deferred.
9. Tests added or updated.
10. Typecheck and full test-suite results.

