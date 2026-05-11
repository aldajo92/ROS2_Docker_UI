# Vehicle Motion Runtime Refactor Prompt

Use this prompt when refactoring `angy_sim_ros2` so vehicle evolution can be
swapped between:

- ideal kinematics
- the current unicycle-style motion behavior
- a local physics engine such as Rapier
- a future remote physics runtime

This prompt is intentionally grounded in the current codebase and should be
used together with:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Proposals/URDF_Rapier_Integration_Proposal.md`

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to introduce a runtime abstraction for vehicle state evolution so
the simulator can preserve its current deterministic kinematic behavior while
also supporting future physics-backed implementations.

The main goal is **not** to immediately add a full new physics engine. The
goal is to remove hard coupling between:

- `VehicleEntity`
- `VehicleDynamicsSystem`
- the current built-in unicycle integration logic

and replace it with a pluggable runtime contract.

---

## Context From the Current Project

The project currently has:

- `VehicleEntity` in `src/simulation/entities/VehicleEntity.ts`
- `VehicleDynamicsSystem` in `src/simulation/systems/VehicleDynamicsSystem.ts`
- addressed commands flowing through:
  - `VehicleCommandQueue`
  - `VehicleCommandSystem`
  - `VehicleEntity.setCommand(...)`
- collision delegated through `CollisionBackend2D`
- an optional Rapier collision backend in:
  - `src/infrastructure/collision/rapier/`

Important current behavior:

- `VehicleEntity` stores pose and controls
- `VehicleEntity.update(dt, state)` performs the actual unicycle integration
- `VehicleDynamicsSystem` iterates vehicles and calls `entity.update(...)`
- collision is downstream from that motion
- Rapier is **not** currently the source of truth for vehicle dynamics

The simulator already has the right layering style:

- simulation contracts in `src/simulation/`
- heavy implementations in `src/infrastructure/`
- composition at the app/provider layer

The refactor should preserve that style.

---

## Objective

Introduce a new abstraction for vehicle motion evolution so the simulator can
switch per configuration or scenario between:

1. a built-in deterministic kinematic runtime that reproduces current behavior
2. a local physics-backed runtime such as Rapier
3. a future remote physics runtime

The rest of the simulator should consume a normalized vehicle state and should
not care which runtime produced it.

---

## High-Level Design Goal

Move the "how the vehicle evolves over time" responsibility out of
`VehicleEntity.update(...)` and into a pluggable runtime contract.

Do **not** make `VehicleEntity` import Rapier, remote networking code, or other
engine-specific dependencies.

Do **not** make React or renderers aware of the selected runtime.

Prefer this shape:

```text
VehicleCommandSystem
  -> queues / applies canonical commands

VehicleDynamicsSystem
  -> delegates vehicle evolution to a VehicleMotionRuntime

VehicleMotionRuntime
  -> KinematicVehicleMotionRuntime
  -> RapierVehicleMotionRuntime
  -> RemoteVehicleMotionRuntime
```

Avoid this shape:

```text
VehicleEntity -> Rapier
VehicleEntity -> remote runtime
VehicleEntity -> transport code
```

---

## Core Rules

Follow these strictly:

- `src/simulation/` must own the runtime contracts and state shapes.
- `src/infrastructure/` must own concrete vendor-heavy implementations.
- `VehicleEntity` must remain free of Rapier, ROS, networking, and UI imports.
- The built-in kinematic path must remain available as a first-class runtime.
- The current command flow must remain canonical.
- Renderers must continue reading normalized simulation state only.
- Replay and metrics should continue to operate over simulation-owned state,
  not engine-specific runtime objects.

---

## Terminology

- **Vehicle motion runtime**: the component that computes the next physical or
  kinematic state of vehicles given commands and `dt`.
- **Kinematic runtime**: deterministic built-in runtime that reproduces current
  unicycle behavior.
- **Physics runtime**: runtime that uses a physics engine or remote simulation
  service to compute motion.
- **Normalized vehicle state**: the simulation-owned pose/velocity values
  written back into the simulator regardless of which runtime produced them.

---

## What the Refactor Should Achieve

After the refactor, the simulator should be able to run the same scenario in
multiple modes:

- ideal kinematic mode for validation and reproducibility
- current built-in motion mode
- local engine-backed mode such as Rapier
- future remote-engine mode

The rest of the system should stay stable:

- command producers still generate canonical vehicle commands
- collision systems still consume normalized state
- renderers still consume normalized state
- replay still consumes normalized state

---

## Proposed Internal Contract

Define a simulation-owned contract under a new module such as:

```text
src/simulation/physics/
  VehicleMotionRuntime.ts
  VehicleMotionRuntimeTypes.ts
```

Suggested runtime contract:

```ts
export interface VehicleRuntimeCommand {
  vehicleId: string
  linearVelocity?: number
  angularVelocity?: number
}

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
}

export interface VehicleMotionRuntime {
  readonly name: string

  reset(): void
  dispose?(): void

  syncVehicles(vehicles: readonly VehicleEntity[]): void
  applyCommands(commands: readonly VehicleRuntimeCommand[]): void
  step(dt: number): void

  readVehicleState(vehicleId: string): VehicleRuntimeState | undefined
}
```

It is acceptable to refine naming, but preserve the intent:

- simulation layer owns the contract
- concrete runtimes implement it
- `VehicleDynamicsSystem` becomes the orchestrator

---

## Recommended First Implementations

### 1. `KinematicVehicleMotionRuntime`

This runtime should reproduce the current behavior exactly or as closely as
possible:

- same unicycle integration semantics
- same stickiness assumptions for commands
- same pose results for the same inputs and `dt`

This runtime becomes the default and preserves existing functionality.

### 2. `RapierVehicleMotionRuntime`

This runtime may initially be a stub or a thin first pass, but it should live
under:

```text
src/infrastructure/physics/rapier/
```

It must not be wired until the contract is stable.

### 3. `RemoteVehicleMotionRuntime`

Do not fully implement unless explicitly requested, but design the contract so
it is feasible.

This runtime would:

- send commands to a remote process
- advance or request remote simulation state
- read back normalized vehicle poses

---

## `VehicleEntity` Refactor Direction

`VehicleEntity` should stop being the place where the official vehicle dynamics
live.

Recommended end state:

- `VehicleEntity` remains the simulation-owned logical representation of the
  vehicle
- `VehicleEntity` still carries:
  - id
  - type
  - pose
  - current command / controls
  - metrics-friendly fields if still useful
- but `VehicleEntity.update(...)` should no longer be the authoritative
  integration path when a motion runtime is active

Two acceptable intermediate states:

1. Keep `VehicleEntity.update(...)` only as an implementation detail used by
   `KinematicVehicleMotionRuntime`
2. Move the unicycle integration math completely out of `VehicleEntity` into
   the kinematic runtime

Option 2 is cleaner if feasible.

---

## `VehicleDynamicsSystem` Refactor Direction

`VehicleDynamicsSystem` should become the coordinator of the runtime.

Instead of:

```text
for each vehicle:
  vehicle.update(dt, state)
```

it should do something closer to:

```text
1. collect vehicles from simulation state
2. sync vehicle registry into the runtime
3. pass current commands to the runtime
4. step runtime(dt)
5. read normalized states back
6. write the resulting state into VehicleEntity / SimulationState
7. update metrics
```

This keeps the simulation layer in control while allowing motion computation to
be delegated.

---

## Configuration Strategy

Add a runtime selection mechanism at the composition root.

Possible direction:

```ts
type VehicleMotionRuntimeType =
  | 'kinematic'
  | 'rapier'
  | 'remote'
```

Suggested file locations:

```text
src/simulation/physics/
  VehicleMotionRuntimeConfig.ts

src/app/
  buildVehicleMotionRuntime.ts
```

The selection should happen in composition code, not deep inside
`VehicleEntity`.

---

## Metrics and Replay

Metrics should remain simulation-owned.

Important rules:

- metrics must be computed from normalized state
- replay should not depend on engine-specific objects
- runtime state should be projected into the same shape consumed by replay and
  rendering

If a physics runtime introduces richer state than the current system exposes,
the first pass may safely ignore extra fields as long as the normalized
simulation-owned vehicle pose stays correct.

---

## Collision Relationship

Do not conflate the new motion runtime abstraction with the existing
`CollisionBackend2D` abstraction.

Current state:

- `CollisionBackend2D` abstracts collision detection

New state:

- `VehicleMotionRuntime` abstracts vehicle motion evolution

Longer term, a larger `PhysicsRuntime` abstraction may unify:

- motion evolution
- contact generation
- rigid-body world stepping

But for this refactor, it is acceptable to start with vehicle motion only.

---

## Suggested File Layout

This is one acceptable shape:

```text
src/simulation/physics/
  VehicleMotionRuntime.ts
  VehicleMotionRuntimeTypes.ts
  KinematicVehicleMotionRuntime.ts

src/infrastructure/physics/rapier/
  RapierVehicleMotionRuntime.ts

src/infrastructure/physics/remote/
  RemoteVehicleMotionRuntime.ts
```

If you find a cleaner naming scheme that matches the project style better, use
it, but preserve the separation of:

- simulation-owned contracts
- built-in deterministic runtime
- infrastructure-owned heavy runtimes

---

## Implementation Plan

Implement in stages.

### Stage 1

- add the runtime interface
- add `KinematicVehicleMotionRuntime`
- refactor `VehicleDynamicsSystem` to use the runtime
- preserve current behavior

### Stage 2

- move runtime selection into composition
- add tests proving kinematic mode reproduces the old path

### Stage 3

- add a first `RapierVehicleMotionRuntime` scaffold
- do not overreach into full articulated robots yet

### Stage 4

- leave clean extension points for a future remote runtime

---

## Testing Expectations

At minimum, add or update tests for:

- current vehicle motion behavior preserved in kinematic mode
- `VehicleDynamicsSystem` delegating to the runtime
- runtime selection wiring
- metrics still updating correctly
- no forbidden imports introduced into `src/simulation/`

If practical, add a regression test showing that the kinematic runtime produces
the same pose sequence as the previous implementation for a fixed command
sequence.

---

## Out of Scope for This Prompt

Do not attempt all of the following unless explicitly required:

- full articulated robot support
- URDF import
- TF/frame-transform implementation
- remote physics transport protocol
- full Rapier dynamics redesign

This refactor is about establishing the abstraction boundary first.

---

## Deliverables

Implement the refactor in code if requested, or otherwise produce a concrete
architecture proposal and file-level plan.

At the end, provide:

- summary of changes or proposed changes
- architecture decisions made
- tradeoffs
- follow-up work required for Rapier-backed and remote runtimes

