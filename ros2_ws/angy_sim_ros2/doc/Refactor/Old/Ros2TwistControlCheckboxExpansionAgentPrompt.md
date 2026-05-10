# ROS2 Twist Control Checkbox Expansion Agent Prompt

Use this prompt to correct the ROS2 Twist vehicle-control UI after the initial
`interaction.ros2TwistControls` implementation.

The existing implementation already added:

- scenario JSON support for `interaction.ros2TwistControls`,
- app-level Twist topic bindings,
- runtime `VehicleCommandTopicBridge` wiring,
- `RosTwistToVehicleCommandAdapter` scale / limits support,
- and a `Ros2TopicsPanel` vehicle dropdown for
  `geometry_msgs/msg/Twist` topics.

However, the intended UX was misunderstood.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to refine the ROS2 Topics panel so `geometry_msgs/msg/Twist` rows
behave like controllable interaction topics, not renderable visualization
topics.

---

## Problem

Today, the `Ros2TopicsPanel` row behavior is driven mostly by whether a topic is
renderable:

- the chevron is disabled when `renderable.isRenderable(topic)` is false,
- the checkbox is disabled when a topic is not renderable,
- expanded settings only exist for renderable topics,
- and the Twist vehicle dropdown is rendered directly in the main row.

This is wrong for `geometry_msgs/msg/Twist`.

Twist topics are not renderable, but they are controllable. The row should still
have an enabled checkbox and expandable settings.

---

## Desired UX

For already-supported visualization topics:

- `nav_msgs/msg/Path`
- `geometry_msgs/msg/PoseArray`

keep the current behavior:

- checkbox means "render / stop rendering this topic",
- chevron expands visualization settings,
- expanded settings show visual controls such as color, thickness, and arrow
  size.

For `geometry_msgs/msg/Twist` topics:

- checkbox means "enable / disable this topic as a vehicle-control input",
- checkbox must not mean "render",
- checkbox must be enabled for Twist topics so the user can activate or
  deactivate the control binding from the row,
- checking the checkbox activates the binding,
- unchecking the checkbox deactivates the binding,
- chevron should be enabled even though the topic is not renderable,
- expanding the row should show Twist-control settings, not visualization
  settings,
- the vehicle-selection dropdown must be inside the expanded settings panel,
  not in the main topic row,
- the dropdown should appear in the expanded settings when the Twist checkbox is
  checked / enabled,
- the dropdown should not be visible in the main row under any condition,
- the main row should stay compact: chevron, checkbox, topic name, message type,
  Echo.

Suggested visual shape:

```text
▶ [ ] /cmd_vel geometry_msgs/msg/Twist Echo
```

Checked and expanded:

```text
▼ [x] /cmd_vel geometry_msgs/msg/Twist Echo
  Vehicle: [ego ▼]
```

Unchecked and expanded:

```text
▼ [ ] /cmd_vel geometry_msgs/msg/Twist Echo
  Enable this topic to select a vehicle.
```

No vehicle dropdown text such as `No vehicles` should appear in the collapsed
main row. If no vehicles exist, that hint belongs inside the expanded settings
panel only.

---

## Visual Style Consistency

The expanded Twist settings must look and feel like the existing expanded
settings used by Path and PoseArray rows. The intent is that a user opening
the chevron on any topic sees the same kind of panel, just with different
fields inside.

Required:

- Reuse the existing CSS classes `ros2-topics-settings` and
  `ros2-topics-settings-row`.
- Use the same `<label>Name:</label> <control />` row pattern used by Color,
  Thickness, and Arrow size.
- Match the existing label style and casing (e.g. `Vehicle:`).
- Match the existing inactive-row dimming behavior using
  `ros2-topics-settings--inactive` when a Twist row is expanded but disabled.
- Do not introduce Twist-specific layout, spacing, or typography. If a new
  group container class is genuinely needed, follow the existing
  `.ros2-topics-*-group` naming.

Forbidden:

- Custom background colors, borders, or padding only for Twist settings.
- A different chevron glyph for Twist rows.
- A different settings panel position (e.g. floating or absolute).
- A separate visual treatment that signals "this is a different type of
  panel".

The user experience goal: the user should not be able to tell that the Twist
settings panel is implemented in a separate code path. It must feel like one
unified row component with type-specific fields inside.

---

## Checkbox Semantics

For Twist rows, the checkbox controls `enabled` on the topic-to-vehicle binding:

```ts
{
  topic: '/cmd_vel',
  vehicleId: 'ego',
  enabled: true
}
```

Expected behavior:

- checked means the binding is enabled and the runtime bridge should be active,
- unchecked means the binding remains known but has `enabled: false`,
- unchecking must not delete the binding or forget the selected vehicle,
- re-checking should reconnect the topic to the same selected vehicle when
  possible,
- the checkbox must remain available for Twist topics even though Twist is not in
  `RENDERABLE_TOPIC_WHITELIST`,
- the checkbox disabled state for Twist must not depend on
  `renderable.isRenderable(topic)`.

If there is no selected vehicle yet and the user checks the checkbox:

- prefer binding to the first available vehicle,
- if there are no vehicles, allow the row to expand and show a compact hint in
  the expanded settings such as `No vehicles`. The checkbox may be disabled only
  because there are no vehicle targets, not because Twist is non-renderable.

---

## Dropdown Semantics

The dropdown still selects the target vehicle for the Twist topic.

Rules:

1. The dropdown only appears inside expanded settings for
   `geometry_msgs/msg/Twist` rows.
2. The dropdown options come from active scenario vehicle entities.
3. Selecting a vehicle updates the binding's `vehicleId`.
4. Selecting a vehicle should keep or set `enabled: true` unless the UI explicitly
   supports choosing a vehicle while disconnected.
5. If the selected vehicle disappears after another scenario load:
   - clear the selected vehicle, or
   - fall back to the first available vehicle.
   Choose one behavior and document it.
6. If there are no vehicle entities:
   - do not render `No vehicles` in the main row,
   - the expanded settings should show `No vehicles`,
   - the row should still be expandable so the user understands why control
     cannot be configured.
7. If the Twist checkbox is unchecked:
   - do not show the dropdown,
   - show a compact expanded-settings hint such as
     `Enable this topic to select a vehicle.`,
   - keep the selected vehicle in state so re-checking restores it.
8. If the Twist checkbox is checked:
   - show the dropdown inside the expanded settings,
   - if vehicles exist and no vehicle is selected yet, default to the first
     available vehicle.

---

## Architecture Requirements

Follow these rules strictly:

- Do not make `geometry_msgs/msg/Twist` renderable.
- Do not add Twist to `RENDERABLE_TOPIC_WHITELIST`.
- Keep Twist control separate from visualization controls.
- Do not introduce ROS-specific imports into `src/simulation` or `src/math`.
- Do not import `roslib`, React, Three.js, Phaser, or DOM APIs into simulation
  core.
- External ROS callbacks must keep using `VehicleCommandQueue`; do not mutate
  `SimulationState` or entities directly.
- Renderers must remain unchanged and read-only.
- Do not change physics, collision, replay, or renderer behavior.

---

## Suggested Implementation

### 1. Split Row Capabilities

In `src/ui/Ros2TopicsPanel.tsx`, separate these concepts:

```ts
const isRenderable = renderable?.isRenderable(topic) ?? false
const isTwistControl = topic.type === TWIST_MESSAGE_TYPE
const canExpand = isRenderable || isTwistControl
```

Use `canExpand` for the chevron, not only `isRenderable`.

Important: do not add Twist to the renderable whitelist just to make this work.
Twist control is a second row capability, parallel to rendering.

### 2. Rename Generic Row Concepts Locally

Avoid keeping names like `isSelected`, `handleRenderToggle`, and `renderTitle`
as the only row state, because Twist rows have a different meaning.

Prefer local variables like:

```ts
const rowChecked = isTwistControl ? isTwistEnabled : isRenderableSelected
const rowCheckboxDisabled = isTwistControl
  ? twistCheckboxDisabled
  : !isRenderable
const rowCheckboxTitle = isTwistControl
  ? twistCheckboxTitle
  : renderTitle
const handleRowCheckboxToggle = () => {
  if (isTwistControl) {
    onTwistControlEnabledChange?.(topic.name, !isTwistEnabled)
    return
  }
  // existing render toggle behavior
}
```

Keep aria labels accurate:

- renderable topics: `Render / Stop rendering <topic>`,
- Twist topics: `Connect / Disconnect <topic> from vehicle control`.

For Twist rows, `twistCheckboxDisabled` should be based on whether control can be
configured, not on renderability. A good first implementation:

```ts
const hasVehicleOptions = (twistControlVehicles ?? []).length > 0
const hasExistingTwistBinding = twistControlBindings?.[topic.name] !== undefined
const twistCheckboxDisabled = !hasVehicleOptions && !hasExistingTwistBinding
```

This lets a previously-bound topic remain visible and toggleable while still
preventing users from enabling a brand-new binding when there are no vehicle
targets.

### 3. Add an Enabled Toggle Callback

Extend `Ros2TopicsPanelProps` with a callback such as:

```ts
onTwistControlEnabledChange?: (topic: string, enabled: boolean) => void
```

Keep the existing vehicle dropdown callback for vehicle changes:

```ts
onTwistControlBindingChange?: (topic: string, vehicleId: string) => void
```

If desired, rename the vehicle callback to make its purpose clearer:

```ts
onTwistControlVehicleChange?: (topic: string, vehicleId: string) => void
```

Only rename if the blast radius is small and tests are updated.

### 4. Move Dropdown Into Expanded Settings

Remove `TwistVehicleDropdown` from the main row.

This is the most important UI correction.

The main row must never render:

```text
▶ /cmd_vel geometry_msgs/msg/Twist No vehicles Echo
```

or:

```text
▶ /cmd_vel geometry_msgs/msg/Twist [Vehicle dropdown] Echo
```

The main row should contain only:

```text
chevron, checkbox, topic name, message type, Echo
```

The expanded settings panel must reuse the existing visual structure used by
`nav_msgs/msg/Path` and `geometry_msgs/msg/PoseArray` rows so all expanded
panels feel like the same component.

Required structure:

```tsx
{isExpanded && (
  <div
    className={`ros2-topics-settings${
      rowChecked ? '' : ' ros2-topics-settings--inactive'
    }`}
  >
    {isTwistControl ? (
      rowChecked ? (
        <div className="ros2-topics-settings-row">
          <label>Vehicle:</label>
          <TwistVehicleDropdown ... />
        </div>
      ) : (
        <p className="ros2-topics-settings-hint">
          Enable this topic to select a vehicle.
        </p>
      )
    ) : (
      // existing Color / Thickness / Arrow size rows
    )}
  </div>
)}
```

Style rules:

- Reuse the existing wrapper class `ros2-topics-settings`. Do not introduce a
  new container class for Twist.
- Reuse the existing row class `ros2-topics-settings-row`. Each setting must
  follow the `<label>Name:</label> <control />` pattern used by Color and
  Thickness.
- Use a sentence-case label ending in a colon, identical in tone to
  `Color:`, `Thickness:`, and `Arrow size (m):`.
- Do not invent new spacing, font sizes, or margin overrides specific to Twist.
  The dropdown should align to the column reserved for input controls in the
  existing rows.
- The `--inactive` modifier (`ros2-topics-settings--inactive`) is used today to
  dim visualization settings when the topic is not selected. Apply the same
  modifier when a Twist row is expanded but `enabled === false`, so the
  dim/active behavior matches Path / PoseArray rows.
- Do not show visualization settings (Color / Thickness / Arrow size) for
  Twist topics.
- Do not show the vehicle dropdown for Path / PoseArray topics.
- Do not render `TwistVehicleDropdown` as a direct child of
  `.ros2-topics-row`.
- Do not add an extra grid column to `.ros2-topics-row` only for the Twist
  dropdown. The row grid should stay aligned with the other rows.

If a per-control container class is required (e.g. `.ros2-topics-vehicle-group`),
mirror the naming used by `.ros2-topics-color-group` and
`.ros2-topics-thickness-group` so the CSS file stays consistent.

### 5. Update App Binding Handlers

In `src/app/App.tsx`, keep the lifted `twistControlBindings` state, but change
the handlers so:

- vehicle dropdown changes update `vehicleId`,
- checkbox changes update `enabled`,
- unchecking does not delete the binding,
- checking with no binding creates one using the first available vehicle when
  possible.

Suggested helper behavior:

```ts
function enableTwistBinding(topic: string, enabled: boolean) {
  if (enabled && noBindingYet) {
    const firstVehicle = twistControlVehicleOptions[0]?.id
    if (!firstVehicle) return
    add { topic, vehicleId: firstVehicle, enabled: true }
  } else {
    update existing binding enabled
  }
}
```

The runtime path in `CommunicationProvider` already filters:

```ts
bindings.filter((b) => b.enabled !== false)
```

so disabling a binding should tear down the bridge on the next effect run.

### 6. Preserve Scenario JSON Policy

Keep the current policy unless explicitly changed:

- scenario-declared bindings load into app state,
- dropdown / checkbox UI changes update live app state,
- UI changes do not automatically sync back into the Scenario Editor JSON.

If this policy changes, update:

- `doc/Architecture.md`,
- tests,
- and any scenario editor sync helpers.

---

## Tests To Add Or Update

### Ros2TopicsPanel Tests

Update or add tests for:

- Twist rows render an enabled checkbox when vehicle options exist.
- Twist rows do not require `renderable.isRenderable(topic)` to be true.
- Twist rows have an enabled chevron.
- Expanding an unchecked Twist row shows a hint, not the dropdown.
- Checking a Twist row and expanding it shows `Vehicle: [dropdown]`.
- The vehicle dropdown is not rendered in the main row.
- The collapsed main Twist row never contains `No vehicles`.
- The vehicle dropdown is not shown for Path / PoseArray rows.
- Checking a Twist checkbox calls `onTwistControlEnabledChange(topic, true)`.
- Unchecking a Twist checkbox calls `onTwistControlEnabledChange(topic, false)`.
- Twist checkbox aria label and title refer to connect / disconnect, not render.
- If no vehicles exist, the expanded settings show `No vehicles` and the main
  row remains clean.
- The Twist settings panel reuses `ros2-topics-settings` and
  `ros2-topics-settings-row`.
- The inactive Twist settings panel uses `ros2-topics-settings--inactive` when
  unchecked.
- Existing Path and PoseArray render checkbox behavior remains unchanged.
- Existing Path / PoseArray visual settings still appear only when expanded.

### App Tests

If there are app-level tests for scenario load / props:

- scenario `ros2TwistControls` with `enabled: false` should show the Twist row
  unchecked.
- toggling a Twist checkbox should update app binding state without deleting the
  selected vehicle.
- checking a Twist row with no binding should bind to the first available
  vehicle.
- disabling a binding should pass `enabled: false` to `CommunicationProvider`.

### CommunicationProvider Tests

If coverage exists or is easy to add:

- `enabled: false` bindings do not create a bridge.
- re-enabling the same binding creates the bridge again.
- empty / missing binding list still falls back to `/cmd_vel -> ego`, unless that
  fallback policy is intentionally changed.

---

## Validation Commands

Run focused tests:

```bash
node_modules/.bin/vitest run src/ui/Ros2TopicsPanel.test.tsx
node_modules/.bin/vitest run src/infrastructure/communication/rosbridge/adapters/RosTwistToVehicleCommandAdapter.test.ts
node_modules/.bin/vitest run src/simulation/scenarios/ScenarioLoader.test.ts
```

Then run:

```bash
npx tsc --noEmit
node_modules/.bin/vitest run
```

---

## Report Back

After implementing, report:

1. How Twist row checkbox semantics differ from renderable row checkbox
   semantics.
2. Where the Twist vehicle dropdown appears.
3. Whether unchecking a Twist row preserves the selected vehicle.
4. What happens when a user checks a Twist row with no selected vehicle.
5. What happens when there are no vehicles.
6. Whether UI changes sync back into Scenario Editor JSON.
7. Runtime effect of `enabled: false`.
8. Tests added or updated.
9. Typecheck and test results.
