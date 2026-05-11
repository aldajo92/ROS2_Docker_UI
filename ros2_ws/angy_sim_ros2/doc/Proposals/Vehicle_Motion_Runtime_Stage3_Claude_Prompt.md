# Vehicle Motion Runtime Stage 3 Prompt For Claude

Use this prompt to implement Stage 3 of the vehicle-motion runtime refactor in
`angy_sim_ros2`.

Stage 1 introduced:

- the `VehicleMotionRuntime` abstraction
- `KinematicVehicleMotionRuntime`
- `VehicleDynamicsSystem` delegation

Stage 2 introduced:

- configurable runtime selection
- composition-time runtime factory
- provider-level wiring and tests

Stage 3 should add the **first local physics-backed runtime**:

- `RapierVehicleMotionRuntime`

This stage must stay intentionally narrow. The goal is not full robot physics,
URDF, joints, or remote execution yet. The goal is to prove that the runtime
abstraction can be backed by a persistent local physics engine while preserving
the simulator's architecture.

---

## Your Role

You are implementing Stage 3 of an architecture refactor in an existing
TypeScript simulation project.

You must add a first Rapier-backed vehicle runtime that fits the current
project structure:

- simulation-owned contracts in `src/simulation/`
- heavy implementations in `src/infrastructure/`
- composition at the app/provider layer

Read the existing code first, especially:

- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/physics/KinematicVehicleMotionRuntime.ts`
- `src/simulation/physics/VehicleMotionRuntimeConfig.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/app/buildVehicleMotionRuntime.ts`
- `src/infrastructure/collision/rapier/RapierCollisionBackend2D.ts`

Use these docs as context:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Prompt.md`
- `doc/Proposals/URDF_Rapier_Integration_Proposal.md`

---

## Objective

Implement a first `RapierVehicleMotionRuntime` so the simulator can select:

- `kinematic`
- `rapier`

at composition time.

This first Rapier runtime should:

1. own a persistent Rapier 2D world
2. represent each vehicle as a persistent rigid body
3. step the world every tick
4. expose normalized vehicle state back through `VehicleMotionRuntime`
5. remain scoped to **planar vehicle motion only**

This stage is successful if:

- the architecture supports a real non-kinematic runtime
- the simulator still works in `kinematic` mode
- `rapier` mode is selectable and testable

---

## Hard Constraints

Follow these rules strictly:

- Do not put Rapier imports in `src/simulation/`.
- Put Rapier implementation code under `src/infrastructure/`.
- Keep `VehicleDynamicsSystem` runtime-agnostic.
- Keep `VehicleEntity` free of Rapier dependencies.
- Do not implement URDF or articulated bodies in this stage.
- Do not implement a remote runtime in this stage.
- Do not collapse the motion-runtime abstraction back into entity code.

---

## Scope Policy

This stage is intentionally limited to **planar vehicle bodies**.

Acceptable simplifications:

- one rigid body per vehicle
- simple collider shape per vehicle
- no suspension
- no wheel-by-wheel model
- no articulated joints
- no detailed contact response API beyond what Rapier already provides

This is a proof of architecture, not final robotics physics.

---

## Recommended Runtime Semantics

The first Rapier runtime should model each vehicle as a planar rigid body in a
persistent Rapier 2D world.

Recommended control semantics for this stage:

- use vehicle commands to drive target linear/angular velocity
- map `VehicleEntity.controls.v` and `controls.w` into body velocity each tick
- let Rapier integrate the body state through `world.step()`
- read position, rotation, and velocities back into normalized runtime state

This means the runtime is physics-backed in structure, even if the command model
is still close to the current idealized control path.

Do not overcomplicate with forces/torques unless the codebase clearly supports
that cleanly in this stage.

---

## What To Implement

### 1. Add `RapierVehicleMotionRuntime`

Create a new implementation under:

```text
src/infrastructure/physics/rapier/
  RapierVehicleMotionRuntime.ts
```

Responsibilities:

- initialize a persistent Rapier 2D `World`
- create/destroy/update rigid bodies for active vehicles
- assign colliders
- step the world
- expose normalized state via `readVehicleState(...)`

The runtime must implement the existing `VehicleMotionRuntime` contract.

### 2. Runtime lifecycle

The runtime must support:

- `reset()`
- optional cleanup / disposal if needed
- re-syncing vehicles across scenario changes

It must not leak stale rigid bodies after `reset()` or when vehicles disappear.

### 3. Vehicle synchronization policy

When `syncVehicles(vehicles)` is called, the runtime should:

- ensure every current vehicle has a corresponding Rapier body
- remove bodies for vehicles that no longer exist
- initialize new bodies from the current simulation pose

Keep the policy deterministic and explicit.

### 4. Step behavior

On `step(dt)`:

- set or update body velocities from current vehicle controls
- set `world.timestep = dt` or equivalent
- step the persistent world
- store normalized pose/velocity results for readback

### 5. Readback behavior

`readVehicleState(vehicleId)` should return normalized simulation-owned state:

```ts
{
  vehicleId,
  pose: { x, y, yaw },
  velocity: { linear, angular },
  distanceTraveled,
}
```

Keep the shape compatible with the current runtime contract.

### 6. Runtime factory integration

Update:

- `src/app/buildVehicleMotionRuntime.ts`

so that:

- `kinematic` still returns `KinematicVehicleMotionRuntime`
- `rapier` now returns `RapierVehicleMotionRuntime`
- `remote` still throws not implemented

### 7. Tests

Add focused tests for:

- runtime construction via factory
- Rapier runtime stepping basic vehicle motion
- reset behavior
- add/remove vehicle synchronization
- preservation of `kinematic` mode behavior

If there are async initialization requirements for Rapier, handle them cleanly
and document the composition implications. Prefer keeping the integration
consistent with existing Rapier patterns in the repo.

---

## Design Guidance

### A. Persistent world, not per-tick rebuild

Unlike the current Rapier collision backend, this runtime should use a
persistent world.

Do not rebuild the entire world from scratch on every tick.

### B. Keep the simulation core in charge of normalized state

Rapier may compute the motion, but:

- UI
- replay
- metrics
- renderers

should still consume the normalized simulation-owned state.

### C. Avoid overreaching into generic physics runtime

Do not generalize the entire simulator to a full `PhysicsRuntime` abstraction
unless a very small helper becomes obviously necessary.

This stage is specifically about making `VehicleMotionRuntime` real with one
non-kinematic implementation.

---

## Suggested File Layout

One acceptable result:

```text
src/infrastructure/physics/rapier/
  RapierVehicleMotionRuntime.ts
  RapierVehicleMotionRuntime.test.ts
```

And updates to:

```text
src/app/buildVehicleMotionRuntime.ts
src/app/buildVehicleMotionRuntime.test.ts
```

If you need a tiny internal helper in the same folder for mapping, that is
acceptable.

---

## Default Behavior Requirement

`kinematic` must remain the default runtime.

This stage must not change default provider behavior. A user only gets Rapier
motion if they explicitly request:

```ts
{ type: 'rapier' }
```

---

## Acceptable First-Pass Physics Model

A reasonable first pass is:

- dynamic rigid body per vehicle
- collider sized from vehicle radius
- linear velocity driven along current body heading
- angular velocity driven directly from command

This is sufficient for Stage 3 even if it is not yet a rich force-based vehicle
model.

The key success criterion is architectural, not realism-maximal.

---

## What Not To Do In This Stage

Do not implement:

- URDF import
- articulated links/joints
- sensors
- frame-transform system
- remote runtime transport
- full generalized entity physics
- broad project-wide migration to a `PhysicsRuntime`

Stay tightly scoped.

---

## Testing Requirements

At minimum, add tests for:

1. `buildVehicleMotionRuntime`
   - `rapier` returns the Rapier runtime
   - `kinematic` still returns the kinematic runtime
   - `remote` still throws

2. `RapierVehicleMotionRuntime`
   - creates and steps a vehicle body
   - produces pose change for forward command
   - preserves yaw updates for angular command
   - clears state on reset
   - removes stale bodies when vehicles disappear

3. regression safety
   - existing Stage 1 and Stage 2 tests still pass

Prefer deterministic tests.

---

## Deliverables

Implement the code changes and tests.

At the end, provide:

- summary of changes
- files added/updated
- how `rapier` mode works
- limitations of this first-pass implementation
- follow-up work needed for Stage 4

