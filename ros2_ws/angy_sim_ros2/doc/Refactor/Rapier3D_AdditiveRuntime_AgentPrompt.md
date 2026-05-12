# Rapier 3D Additive Runtime Agent Prompt

Use this prompt to add **Rapier 3D as a new runtime path** in `angy_sim_ros2`
without overwriting or destabilizing the current working simulator.

This task is intentionally **progressive / additive**.

The current simulator already works and must remain intact.

The goal is **not** to convert the whole project to 3D-first right now.

The goal is:

- keep the current `kinematic` path working exactly as it does today
- add a new `Rapier 3D` runtime as a separate capability
- make that new path explicit and isolated
- avoid refactors that would force the existing 2D baseline to depend on a new
  world model
- avoid broad architectural churn that would make existing working code depend
  on experimental 3D work

---

## Core Principle

Do **not** replace the current simulator foundation.

Do **not** rewrite all existing state, renderers, or scenarios around a new 3D
canonical model in this task.

Instead:

**preserve the current simulator as the stable baseline and add a new runtime
track beside it**

That means:

- `kinematic` remains the default, stable, current behavior
- a new `rapier3d` runtime is introduced separately
- Three.js can become the first renderer that supports the new runtime
- Phaser support for `rapier3d` can be deferred, limited, or explicitly marked
  unsupported for now

This is an additive architecture step, not a replacement migration.

---

## What Must Stay Untouched In Spirit

The following must remain functionally stable:

- existing `kinematic` runtime behavior
- current 2D scenarios
- current renderer selection for existing working paths
- existing provider/factory/runtime architecture

If something has to be extended, extend it in a way that preserves current
behavior by default.

---

## Read First

Inspect these before changing anything:

- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/physics/KinematicVehicleMotionRuntime.ts`
- `src/infrastructure/physics/rapier/RapierVehicleMotionRuntime.ts`
- `src/infrastructure/physics/remote/RemoteVehicleMotionRuntime.ts`
- `src/simulation/physics/VehicleMotionRuntimeConfig.ts`
- `src/app/buildVehicleMotionRuntime.ts`
- `src/app/buildVehicleMotionRuntimeAsync.ts`
- `src/app/SimulationProvider.tsx`
- `src/app/App.tsx`
- `src/ui/RendererPanel.tsx`
- `src/ui/viewport/SimulationViewportSwitcher.tsx`
- `src/ui/viewport/ThreeSimulationViewport.tsx`
- `src/ui/viewport/PhaserSimulationViewport.tsx`
- `src/simulation/entities/VehicleEntity.ts`
- `src/simulation/core/SimulationState.ts`
- `doc/Architecture.md`
- `doc/Development_Guide.md`

Also use as context:

- `doc/Refactor/Rapier3D_AuthoritativeWorld_AgentPrompt.md`
- `doc/Refactor/RapierAuthoritativePhysicsAgentPrompt.md`

But do **not** implement the broader “rewrite everything around 3D” direction in
this task.

---

## Objective

Add a new runtime option representing a first **Rapier 3D** path while keeping
the current simulator intact.

The intended runtime landscape after this task should be:

- `kinematic`
  - current stable default
  - current 2D behavior
- `rapier`
  - keep existing semantics if still needed for compatibility, or clearly decide
    whether it is superseded
- `rapier3d`
  - new additive runtime
  - new experimental/explicit path
  - Three-oriented first implementation

If renaming or deprecating the current `rapier` path is necessary, do it
carefully and explicitly, but do not silently break existing users.

---

## Product / UX Intent

The user should be able to choose the new mode explicitly.

For example, in the motion runtime selector:

- `Kinematic`
- `Rapier`
- `Rapier 3D (Experimental)`
- `Remote (Pending)` if that label still exists

You do **not** need to fully redesign the UI in this task, but the new runtime
must be clearly presented as a separate mode, not as a hidden replacement.

Also:

- do not imply that Phaser fully supports the new 3D runtime if it does not
- do not imply that all existing scenarios now became true 3D scenarios

---

## Hard Constraints

Follow these rules strictly:

- do not regress `kinematic`
- do not rewrite the whole simulator around a global 3D state model
- do not globally replace existing 2D state contracts in this stage
- do not require the current baseline runtime path to understand or consume full
  3D state in order to keep working
- do not force existing 2D renderer code to depend on a new 3D abstraction
  unless absolutely necessary
- do not break current scenarios by requiring new 3D fields everywhere
- do not over-couple Phaser to incomplete 3D work
- keep heavy Rapier-specific implementation in `src/infrastructure/`
- keep the runtime contract boundary clean
- prefer compatibility adapters over sweeping rewrites

---

## Scope Guidance

This task is about adding a new runtime path, not finishing every downstream
feature.

Acceptable first-step scope:

- add a new runtime type such as `rapier3d`
- add a new runtime implementation under infrastructure
- wire it through the existing provider/factory flow
- support it first with Three.js
- define how unsupported renderer/runtime combinations are handled
- keep current scenarios working with defaults or an explicit limited mapping

Out of scope for this task:

- full 3D migration of every entity/state concept
- full Phaser projection of every 3D feature
- URDF
- remote transport changes
- full frame-transform system
- replacing the current 2D-first baseline with a mandatory 3D-first model

---

## Non-Destructive Evolution Rule

This task must be implemented as a non-destructive extension.

That means:

- existing code that supports `kinematic` should remain the primary truth for
  current working scenarios
- any new 3D-capable structures should be introduced in a way that can coexist
  with existing 2D structures
- if a bridge/adaptor layer is needed for `rapier3d`, add that bridge instead
  of rewriting the whole simulator around it

Use this decision rule:

**if a proposed change would force unrelated existing 2D code to migrate just
so `rapier3d` can exist, that change is probably too invasive for this stage**

---

## Recommended Strategy

### A. Keep `kinematic` unchanged

Do not reinterpret it.

Do not make it depend on any new 3D state model to function.

Do not require unrelated `kinematic` code paths to be rewritten just because
`rapier3d` exists.

### B. Add `rapier3d` as a separate runtime type

This should be an additive new option in runtime config/factory/provider
selection.

Example:

```ts
type VehicleMotionRuntimeType =
  | 'kinematic'
  | 'rapier'
  | 'rapier3d'
  | 'remote'
```

Use your judgment if the exact naming should differ, but the separation must be
explicit.

### C. Add a new runtime implementation

Likely something like:

```text
src/infrastructure/physics/rapier3d/
  Rapier3DVehicleMotionRuntime.ts
```

or another name that clearly distinguishes it from the current Rapier runtime.

Do not overload the current `RapierVehicleMotionRuntime` if that makes the code
ambiguous or destabilizes the current path.

Prefer a new implementation over mutating the existing one into a hybrid that is
harder to reason about.

### D. Treat Three as the first-class renderer for this new mode

It is acceptable if the first usable `rapier3d` experience is:

- runtime selected as `rapier3d`
- renderer selected as `three`

### E. Be explicit about Phaser

Choose one clear behavior for `rapier3d` + `phaser`:

1. temporarily unsupported
2. disabled in UI
3. allowed with a minimal top-down approximation

But do not fake full support if it does not exist yet.

If unsupported, fail clearly and predictably.

---

## Scenario Compatibility Guidance

Current scenarios should continue to work in `kinematic` without any migration.

For `rapier3d`, acceptable first-step approaches include:

- derive a simple 3D interpretation from the existing 2D scenario data
- default all entities to a ground plane
- default missing 3D parameters

For example:

- planar pose -> 3D pose on ground plane
- yaw preserved
- height defaults to 0
- simple collider shape defaults derived from existing radius/size

Do not require the entire scenario ecosystem to become 3D-authored immediately.

If a new 3D-specific scenario/entity shape is introduced, it must be optional
and backward-compatible by default.

---

## Physics Expectations For `rapier3d`

The new runtime should justify its existence by doing something meaningfully new:

- use Rapier 3D
- own an authoritative physical world for that runtime
- support physical collision response in that world

You do not need full robotics realism immediately, but the runtime should not
just be “kinematic with 3D-looking wrappers”.

The minimum bar is:

- separate implementation
- separate semantics
- real physics engine ownership of motion/contact for supported use cases

But do not expand the task into “make the whole simulator natively 3D
everywhere” just to satisfy this runtime.

---

## Renderer/Runtime Compatibility Policy

You must define and implement a clear policy for combinations such as:

- `kinematic` + `three`
- `kinematic` + `phaser`
- `rapier` + `three`
- `rapier` + `phaser`
- `rapier3d` + `three`
- `rapier3d` + `phaser`

If some combinations are unsupported, make that explicit in code and/or UI.

Do not leave the project in a state where an invalid combination appears to be
supported but behaves nonsensically.

---

## Testing Requirements

Add or update tests that prove the additive design, not a replacement design.

You should cover at least:

1. `kinematic` still behaves exactly as before
2. the new runtime type is selectable through the existing config/factory path
3. the new runtime creates its own fresh engine/runtime path without breaking
   existing ones
4. `rapier3d` support is correctly wired for Three
5. unsupported or limited renderer/runtime combinations behave clearly

If a runtime/renderer compatibility policy is added, test it.

Also add at least one test or verification point that proves the existing
`kinematic` path did not need the new `rapier3d` machinery to keep working.

---

## Non-Goals

Do not do these in this task:

- replace the whole simulator with a 3D-first architecture
- force Phaser to fully support the new 3D runtime immediately
- rewrite all existing state contracts to quaternions/3D transforms everywhere
- URDF
- remote runtime redesign
- mass migration of all docs/UI beyond what is necessary

---

## Acceptance Criteria

This task is complete if:

1. the current simulator remains intact under `kinematic`
2. a new `rapier3d` runtime path exists as an additive feature
3. runtime selection clearly distinguishes old stable behavior from the new 3D
   path
4. Three can serve as the first supported renderer for the new path
5. unsupported/partial Phaser behavior is handled explicitly rather than
   implicitly
6. the implementation does not depend on rewriting the existing working system
7. the existing 2D baseline remains the stable default path with no mandatory
   migration cost

---

## Deliverables

At the end:

1. implement the new additive `rapier3d` path
2. add/update tests
3. explain:
   - what was added
   - what existing behavior was intentionally preserved
   - how runtime/renderer compatibility is handled
   - what assumptions/defaults are used to map current scenarios into the new
     path
   - what still remains for future work
