# Vehicle Motion Runtime Stage 4 Prompt For Claude

Use this prompt to implement Stage 4 of the vehicle-motion runtime refactor in
`angy_sim_ros2`.

At this point:

- Stage 1 introduced the `VehicleMotionRuntime` abstraction and delegated
  `VehicleDynamicsSystem` to it.
- Stage 2 made runtime selection configurable.
- Stage 3 added a first local physics-backed implementation:
  `RapierVehicleMotionRuntime`, including async provider composition.

Stage 4 should now add the **first remote-backed runtime path**.

This stage must remain controlled. Do not mix this task with URDF import,
articulated robots, frame-graph infrastructure, or a full generic
physics-runtime redesign. The goal is to prove that the simulator can drive
vehicle motion through a remote backend while preserving the current
architecture and UI behavior.

---

## Your Role

You are implementing Stage 4 of an architecture refactor in an existing
TypeScript simulation project.

You must extend the current runtime system so the simulator can use:

- `kinematic`
- `rapier`
- `remote`

through the same high-level composition flow.

Read the current code first, especially:

- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/physics/VehicleMotionRuntimeConfig.ts`
- `src/simulation/physics/KinematicVehicleMotionRuntime.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/app/SimulationProvider.tsx`
- `src/app/buildVehicleMotionRuntime.ts`
- `src/app/buildVehicleMotionRuntimeAsync.ts`
- `src/infrastructure/physics/rapier/RapierVehicleMotionRuntime.ts`

Use these docs as context:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Prompt.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Stage3_Claude_Prompt.md`
- `doc/Proposals/URDF_Rapier_Integration_Proposal.md`

---

## Objective

Implement a first `RemoteVehicleMotionRuntime` that preserves the current
vehicle-motion runtime abstraction while allowing the physics/state evolution to
be owned by an external backend.

This stage is successful if:

1. `remote` becomes a real runtime option.
2. The simulator can step vehicle motion through a remote adapter contract.
3. The remote path uses normalized simulation-owned state on the client side.
4. `kinematic` and `rapier` continue to work.
5. Tests prove the remote runtime behavior without requiring a real network
   service.

---

## Why This Stage Exists

The architectural direction of this project is that the simulator should not be
hard-coupled to one physics library or one execution location.

The project already supports:

- a local idealized runtime (`kinematic`)
- a local physics-backed runtime (`rapier`)

Stage 4 proves the next important capability:

- a remote runtime whose state evolution happens outside the UI process

That makes the architecture meaningfully engine-agnostic and execution-location
agnostic.

---

## Hard Constraints

Follow these rules strictly:

- Do not move physics-library-specific or transport-specific code into
  `src/simulation/`.
- Keep simulation-owned contracts in `src/simulation/`.
- Keep heavy remote implementation details in `src/infrastructure/`.
- Keep `VehicleDynamicsSystem` runtime-agnostic.
- Keep `VehicleEntity` free of remote/transport details.
- Do not implement URDF in this stage.
- Do not implement articulated robots in this stage.
- Do not redesign the whole system into a generic `PhysicsRuntime` unless a
  very small compatibility helper becomes clearly necessary.

---

## Scope Policy

This stage is about **remote vehicle motion**, not full remote world
simulation.

Acceptable simplifications:

- only vehicle motion is remote
- remote state can be modeled as request/response stepping
- no real ROS 2 dependency is required for this stage
- no real backend process is required for tests
- a fake or in-memory remote adapter is acceptable for unit and integration
  tests

Out of scope:

- URDF
- joints
- articulated dynamics
- frame transforms
- remote rendering
- full world sync for every simulation artifact

---

## Recommended Architecture

Add a small remote transport/adapter boundary that allows the UI-side runtime to
delegate:

- runtime initialization
- vehicle synchronization
- command/state upload
- stepping
- state snapshot readback

One good shape is:

```text
src/simulation/physics/
  RemoteVehicleMotionTypes.ts

src/infrastructure/physics/remote/
  RemoteVehicleMotionClient.ts
  RemoteVehicleMotionRuntime.ts
  InMemoryRemoteVehicleMotionClient.ts
```

You may adjust names if the codebase suggests a better fit, but preserve the
layering:

- shared contracts in `src/simulation/`
- remote implementation under `src/infrastructure/`

---

## Preferred Contract Shape

Keep the existing `VehicleMotionRuntime` contract intact for the rest of the
simulator.

Behind it, introduce a transport/client contract that represents a remote
service.

One acceptable shape:

```ts
export interface RemoteVehicleMotionClient {
  initialize?(): Promise<void>;
  reset(): Promise<void>;
  syncVehicles(vehicles: readonly RemoteVehicleSpec[]): Promise<void>;
  step(input: RemoteVehicleStepInput): Promise<RemoteVehicleStepResult>;
  dispose?(): Promise<void>;
}
```

Where the remote DTOs are simulation-owned and normalized, for example:

```ts
type RemoteVehicleSpec = {
  vehicleId: string;
  pose: { x: number; y: number; yaw: number };
  radius?: number;
};

type RemoteVehicleCommand = {
  vehicleId: string;
  linearVelocity: number;
  angularVelocity: number;
};

type RemoteVehicleStepInput = {
  dt: number;
  commands: RemoteVehicleCommand[];
};

type RemoteVehicleStepResult = {
  vehicles: Array<{
    vehicleId: string;
    pose: { x: number; y: number; yaw: number };
    velocity: { linear: number; angular: number };
    distanceTraveled: number;
  }>;
};
```

You do not need to use exactly these names, but keep the idea:

- normalized DTOs
- no Rapier imports in the shared contracts
- no UI-layer types in the infrastructure client

---

## Implementation Requirements

### 1. Add remote DTOs / contracts

Create small simulation-owned types for the remote motion protocol.

These should live in `src/simulation/physics/` because they represent the
project's own normalized motion schema, not a specific vendor transport.

Keep them minimal and readable.

### 2. Add `RemoteVehicleMotionClient`

Create an infrastructure-side client contract for a remote motion service.

This should be the lowest-level client that `RemoteVehicleMotionRuntime` uses.

Do not make `SimulationProvider` or `VehicleDynamicsSystem` know about this
client directly.

### 3. Add `RemoteVehicleMotionRuntime`

Create a runtime implementation under:

```text
src/infrastructure/physics/remote/
  RemoteVehicleMotionRuntime.ts
```

Responsibilities:

- implement `VehicleMotionRuntime`
- maintain any local cache needed for readback
- convert current vehicles/controls into normalized remote DTOs
- call the remote client on `syncVehicles(...)`, `step(...)`, `reset()`
- expose normalized state through `readVehicleState(...)`

### 4. Add an in-memory test client

To keep this stage testable without a real network/backend service, add an
in-memory client implementation such as:

```text
src/infrastructure/physics/remote/
  InMemoryRemoteVehicleMotionClient.ts
```

This client can internally delegate to `KinematicVehicleMotionRuntime` or a
small equivalent model, as long as:

- the runtime is still going through the remote-client abstraction
- tests prove the remote path and not just the local runtime directly

This is important: do not skip the remote boundary in tests.

### 5. Runtime factory integration

Update runtime composition so `remote` becomes a real supported option.

If remote creation is async, integrate it through the same async composition
flow already used for `rapier`.

The user of `SimulationProvider` should be able to select:

```ts
vehicleMotionRuntimeConfig={{ type: 'remote' }}
```

without ad hoc manual wiring at the call site.

If configuration needs extra fields later, keep the API extensible, but do not
overdesign it in this stage.

### 6. Error handling

Maintain the clear error-classification behavior introduced in Stage 3:

- unsupported sync vs async-required should remain explicit
- async failures should surface clearly through the provider path
- do not silently fall back to another runtime

### 7. Tests

Add focused tests for:

- `RemoteVehicleMotionRuntime` basic stepping
- vehicle add/remove synchronization
- reset behavior
- provider/factory async composition for `remote`
- preservation of `kinematic` and `rapier` behavior

Tests should not require a real server or real browser network transport.

---

## Design Guidance

### A. Keep the runtime contract stable

The rest of the simulator should still see only `VehicleMotionRuntime`.

Do not let remote transport details leak upward into:

- `VehicleDynamicsSystem`
- `VehicleEntity`
- renderers
- replay consumers

### B. Prefer deterministic request/response stepping

For this stage, prefer a simple model:

- client sends current commands and `dt`
- remote side returns normalized state snapshot

This is much easier to reason about and test than background streaming.

### C. Keep state normalization on the simulator boundary

The remote service may own the actual motion evolution, but the client-facing
representation should remain normalized and simulation-owned.

That keeps:

- UI
- replay
- metrics
- renderers

agnostic to where the motion was computed.

### D. Do not overcommit to one transport

Do not bind this stage directly to:

- ROS 2
- rosbridge
- WebSocket specifics
- HTTP specifics

Use an internal client abstraction so a future real transport can be plugged in
later.

---

## Suggested File Layout

One acceptable result:

```text
src/
  simulation/
    physics/
      RemoteVehicleMotionTypes.ts

  infrastructure/
    physics/
      remote/
        RemoteVehicleMotionClient.ts
        RemoteVehicleMotionRuntime.ts
        RemoteVehicleMotionRuntime.test.ts
        InMemoryRemoteVehicleMotionClient.ts
        InMemoryRemoteVehicleMotionClient.test.ts

  app/
    buildVehicleMotionRuntime.ts
    buildVehicleMotionRuntimeAsync.ts
    SimulationProvider.tsx
    buildVehicleMotionRuntimeAsync.test.ts
    SimulationProvider.test.tsx
```

You can refine file names if needed, but keep the separation of concerns.

---

## Non-Goals

Do not do any of the following in this stage:

- implement URDF loading
- implement frame transform infrastructure
- redesign all physics code into a universal world abstraction
- add articulated bodies
- add ROS 2 transport-specific runtime code
- add remote collision visualization
- rewrite replay architecture

Those may come later, but they are not this task.

---

## Acceptance Criteria

Stage 4 is complete if all of the following are true:

1. `remote` is a real runtime mode.
2. `SimulationProvider` can build/select `remote` without ad hoc manual wiring.
3. `VehicleDynamicsSystem` remains runtime-agnostic.
4. Remote-specific code lives outside `src/simulation/`.
5. Tests prove remote stepping and provider composition.
6. Existing `kinematic` and `rapier` modes still pass.

---

## Deliverables

At the end:

1. Implement the remote runtime path.
2. Add tests.
3. Explain:
   - what changed
   - how `remote` is now selected
   - what fake/in-memory remote client was used for tests
   - what remains out of scope after Stage 4
