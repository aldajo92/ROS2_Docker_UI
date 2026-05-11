# Vehicle Motion Runtime Stage 1 Prompt For Claude

Use this prompt to implement the first executable slice of the vehicle-motion
runtime refactor in `angy_sim_ros2`.

The purpose of this prompt is to extract the current vehicle-evolution logic
behind a runtime abstraction **without changing observable behavior**.

This is a Stage 1 prompt only. It should preserve the current simulator
semantics while making the architecture ready for future runtime backends such
as:

- a local Rapier-based runtime
- a remote physics runtime

Do **not** implement those future runtimes yet. Only establish the abstraction
and migrate the current behavior into the first default runtime.

---

## Your Role

You are implementing an architecture refactor in an existing TypeScript
simulation project.

You must preserve current behavior while introducing a new abstraction boundary
 for vehicle motion evolution.

The repo already contains:

- `src/simulation/entities/VehicleEntity.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/simulation/commands/VehicleCommandSystem.ts`
- `src/app/SimulationProvider.tsx`
- tests around entities, systems, replay, and architecture boundaries

Read the existing code first. Do not assume the docs are sufficient on their
own.

---

## Objective

Implement Stage 1 of a runtime refactor so that:

1. the simulator gains a simulation-owned runtime contract for vehicle motion
2. the current built-in vehicle behavior is preserved through a new
   `KinematicVehicleMotionRuntime`
3. `VehicleDynamicsSystem` delegates motion evolution to that runtime
4. no Rapier-specific or remote-runtime-specific code is required yet

The resulting behavior should match the current unicycle integration semantics
as closely as possible.

---

## Architectural Intent

Right now, the current motion behavior is effectively hardcoded across:

- `VehicleEntity`
- `VehicleDynamicsSystem`

We want to move toward:

```text
VehicleCommandSystem
  -> canonical vehicle commands land on VehicleEntity

VehicleDynamicsSystem
  -> delegates state evolution to a VehicleMotionRuntime

VehicleMotionRuntime
  -> KinematicVehicleMotionRuntime   (Stage 1)
  -> RapierVehicleMotionRuntime      (future)
  -> RemoteVehicleMotionRuntime      (future)
```

The rest of the simulator should not need to know which runtime is active.

---

## Hard Constraints

Follow these rules strictly:

- Do not add Rapier dependencies to `src/simulation/`.
- Do not add ROS, transport, React, Three.js, or Phaser dependencies to
  `src/simulation/`.
- Keep the current command flow canonical:
  - producers -> `VehicleCommandQueue`
  - `VehicleCommandSystem`
  - `VehicleEntity.setCommand(...)`
- Preserve current metrics behavior in `VehicleDynamicsSystem`.
- Preserve the current default simulator behavior.
- Prefer small, clean refactors over broad rewrites.
- If a choice is ambiguous, prioritize preserving current behavior.

---

## What To Implement

### 1. Add a simulation-owned runtime contract

Create a new module under `src/simulation/physics/` or another similarly named
simulation-owned folder that matches project style.

Define a contract similar to this:

```ts
export interface VehicleRuntimeState {
  vehicleId: string
  pose: {
    x: number
    y: number
    yaw: number
  }
  velocity?: {
    linear?: number
    angular?: number
  }
  distanceTraveled?: number
}

export interface VehicleMotionRuntime {
  readonly name: string

  reset(): void
  syncVehicles(vehicles: readonly VehicleEntity[]): void
  step(dt: number): void
  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined
}
```

You may refine naming and exact fields, but preserve the intent:

- simulation-owned contract
- vehicle evolution delegated through runtime
- runtime returns normalized state

Do not overdesign this contract for future articulated robots yet.

### 2. Add `KinematicVehicleMotionRuntime`

Implement a built-in runtime that reproduces the current behavior.

This runtime should:

- read current `VehicleEntity` state and controls
- evolve vehicle state using the same unicycle integration semantics as today
- retain current angle wrapping behavior
- retain current `distanceTraveled` semantics
- expose normalized state back to the caller

You may either:

- reuse `VehicleEntity.update(...)` internally, or
- move the unicycle integration math into the runtime

If you move the math, make sure existing behavior is preserved.

### 3. Refactor `VehicleDynamicsSystem`

Change `VehicleDynamicsSystem` so it no longer directly owns the integration
logic.

Instead, it should:

1. collect active vehicles
2. sync them into the runtime
3. call `runtime.step(dt)`
4. read state back from the runtime
5. write the resulting values into `VehicleEntity`
6. update metrics as before

The system should still handle `DynamicActorEntity` appropriately. If dynamic
actors remain on the old path for now, that is acceptable as long as the code
is clean and the behavior is preserved.

### 4. Wire the runtime in composition

Update composition so the default simulator path constructs
`VehicleDynamicsSystem` with `KinematicVehicleMotionRuntime`.

This likely affects:

- `src/app/SimulationProvider.tsx`

Keep the default runtime local and synchronous.

### 5. Preserve compatibility

Make sure the current user-visible simulator behavior remains the same by
default.

This refactor is architectural, not product-facing.

---

## Suggested File Layout

One acceptable file layout is:

```text
src/simulation/physics/
  VehicleMotionRuntime.ts
  VehicleRuntimeState.ts
  KinematicVehicleMotionRuntime.ts
```

And then:

```text
src/simulation/systems/
  VehicleDynamicsSystem.ts   // updated to delegate
```

If a slightly different layout fits the repo better, use it.

---

## Behavior Preservation Requirements

The kinematic runtime must preserve:

- same `dt` interpretation
- same yaw integration order
- same position integration order
- same `wrapAngle(...)` behavior
- same `distanceTraveled` accumulation behavior
- same `v` / `w` telemetry behavior if currently exposed

Do not silently change the physics model.

---

## Testing Requirements

Update and add tests as needed.

At minimum, ensure coverage for:

1. `KinematicVehicleMotionRuntime`
   - reproduces expected unicycle stepping
   - preserves yaw wrapping
   - preserves distance-traveled updates

2. `VehicleDynamicsSystem`
   - delegates through the runtime
   - still updates metrics correctly
   - still updates dynamic actors correctly if they remain on their current path

3. Regression safety
   - existing vehicle motion tests should still pass
   - no architecture boundary violations introduced

If helpful, add a regression test that compares a known command sequence before
and after the refactor.

---

## What Not To Do In This Stage

Do not implement:

- Rapier-backed vehicle dynamics
- remote runtime networking
- articulated robot support
- URDF integration
- frame-transform system
- a full generic physics runtime for every entity type

This prompt is only for introducing the first clean abstraction boundary and
moving the current behavior behind it.

---

## Implementation Notes

Use the current codebase as the ground truth for semantics.

Prefer preserving these existing concepts:

- `VehicleEntity` remains the simulation-owned logical vehicle
- `VehicleCommandSystem` remains the only command application path
- `VehicleDynamicsSystem` remains the orchestrator for motion updates

But evolve them so the actual motion computation is runtime-pluggable.

If you need to keep `VehicleEntity.update(...)` temporarily for compatibility,
that is acceptable in Stage 1 as long as the new runtime boundary is real and
`VehicleDynamicsSystem` now depends on the runtime abstraction rather than
hardcoding the vehicle integration path.

---

## Deliverables

Implement the code changes and tests.

At the end, provide:

- summary of changes
- files added/updated
- any behavior-preservation assumptions
- follow-up work needed for Stage 2

