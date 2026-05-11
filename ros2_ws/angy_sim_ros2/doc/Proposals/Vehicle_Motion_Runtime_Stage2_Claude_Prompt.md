# Vehicle Motion Runtime Stage 2 Prompt For Claude

Use this prompt to implement Stage 2 of the vehicle-motion runtime refactor in
`angy_sim_ros2`.

Stage 1 already introduced:

- a simulation-owned `VehicleMotionRuntime` abstraction
- a default `KinematicVehicleMotionRuntime`
- `VehicleDynamicsSystem` delegating to the runtime

Stage 2 should make that runtime selection configurable and testable without
changing current default behavior.

Do **not** implement Rapier-backed vehicle dynamics yet. Do **not** implement a
remote runtime yet. This stage is about configuration, wiring, regression
safety, and clean extension points.

---

## Your Role

You are implementing Stage 2 of an architecture refactor in an existing
TypeScript simulation project.

Your job is to turn the Stage 1 runtime abstraction into a configurable
composition feature while preserving current behavior by default.

Read the existing code first, especially:

- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/physics/KinematicVehicleMotionRuntime.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/app/SimulationProvider.tsx`
- any tests added in Stage 1

Also use these docs as context:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Prompt.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Stage1_Claude_Prompt.md`

---

## Objective

Implement Stage 2 so that:

1. vehicle motion runtime selection is configurable at composition time
2. the default runtime remains the current kinematic runtime
3. the system is ready for future runtime types such as `rapier` and `remote`
4. tests clearly prove that current behavior is preserved in default mode
5. the new configuration surface is small, explicit, and does not leak vendor
   dependencies into `src/simulation/`

---

## Stage 2 Scope

This stage should cover:

- runtime selection type/config
- runtime construction at composition root
- optional provider/config plumbing
- tests for selection and default behavior
- documentation/comments where useful

This stage should **not** cover:

- actual Rapier vehicle dynamics
- actual remote runtime networking
- scenario JSON runtime selection unless it already fits naturally and cleanly
- UI controls for choosing runtime
- generic physics runtime for every entity type

---

## Architectural Intent

We want to move from:

```text
SimulationProvider
  -> new VehicleDynamicsSystem(new KinematicVehicleMotionRuntime())
```

to something more like:

```text
SimulationProvider
  -> buildVehicleMotionRuntime(config)
  -> new VehicleDynamicsSystem(runtime)
```

The runtime selection must be explicit and owned by composition code, not by
`VehicleEntity` or `VehicleDynamicsSystem`.

Future runtime options should be representable, even if only one is implemented
today.

---

## Hard Constraints

Follow these rules strictly:

- `src/simulation/` owns contracts and configuration types, not vendor code.
- `src/infrastructure/` owns heavy concrete runtime implementations once they
  exist.
- Keep current default behavior unchanged.
- Do not add Rapier dependencies to `src/simulation/`.
- Do not add React or UI dependencies to `src/simulation/`.
- Keep current command flow canonical.
- Keep `VehicleDynamicsSystem` runtime-agnostic.

---

## What To Implement

### 1. Add a runtime selection type

Add a small configuration type for vehicle motion runtime selection.

One acceptable direction:

```ts
export type VehicleMotionRuntimeType =
  | 'kinematic'
  | 'rapier'
  | 'remote'

export interface VehicleMotionRuntimeConfig {
  type: VehicleMotionRuntimeType
}
```

Suggested location:

```text
src/simulation/physics/VehicleMotionRuntimeConfig.ts
```

You may use a slightly different naming scheme if it better matches the repo.

The type should include future values even if only `kinematic` is implemented
right now.

### 2. Add a composition helper to build the runtime

Add a runtime factory at the composition layer.

One acceptable location:

```text
src/app/buildVehicleMotionRuntime.ts
```

Suggested behavior:

- `kinematic` -> return `new KinematicVehicleMotionRuntime()`
- `rapier` -> throw a clear "not implemented yet" error for now
- `remote` -> throw a clear "not implemented yet" error for now

Do not silently fall back to kinematic if the caller explicitly asks for
another runtime type.

### 3. Update `SimulationProvider`

Update `SimulationProvider` so it can accept an optional vehicle-motion runtime
config and build the runtime through the helper rather than hardcoding
`new KinematicVehicleMotionRuntime()`.

Example direction:

```ts
export interface SimulationProviderProps {
  children: ReactNode
  collisionConfig?: CollisionConfig
  vehicleMotionRuntimeConfig?: VehicleMotionRuntimeConfig
}
```

Requirements:

- keep default behavior kinematic when the prop is omitted
- do not complicate the provider unnecessarily
- keep sync behavior for the default path

### 4. Preserve runtime-agnostic `VehicleDynamicsSystem`

`VehicleDynamicsSystem` should not need further architectural change in this
stage except minor cleanup if needed.

It should continue to depend only on the runtime abstraction.

### 5. Add regression-focused tests

Add or update tests to prove:

1. default config builds kinematic runtime
2. explicit `kinematic` config builds kinematic runtime
3. unsupported future runtime types fail loudly and clearly for now
4. existing simulator behavior stays unchanged in default mode

If helpful, add focused tests for the factory helper and provider wiring.

---

## Suggested File Layout

One acceptable result:

```text
src/simulation/physics/
  VehicleMotionRuntime.ts
  KinematicVehicleMotionRuntime.ts
  VehicleMotionRuntimeConfig.ts

src/app/
  buildVehicleMotionRuntime.ts

src/app/
  SimulationProvider.tsx
```

If tests fit better in nearby files, follow existing repo style.

---

## Behavior Preservation Requirements

Default simulator behavior must remain:

- kinematic runtime selected when no config is provided
- same movement semantics as Stage 1
- same metrics behavior
- same command flow

Do not change any vehicle physics semantics in this stage.

---

## Error Handling Requirements

If a caller explicitly chooses an unimplemented runtime such as `rapier` or
`remote`, the error message should be clear and actionable.

Example:

```text
Vehicle motion runtime "rapier" is not implemented yet.
```

Do not silently substitute a different runtime in that case.

---

## Testing Requirements

At minimum, add tests for:

1. runtime factory
   - default path
   - explicit kinematic path
   - explicit unsupported path

2. provider wiring or composition behavior
   - when omitted, provider still uses kinematic runtime

3. regression safety
   - existing Stage 1 runtime/delegation tests still pass

Keep the tests narrow and focused.

---

## Nice-To-Have, If It Fits Cleanly

These are optional only if they remain small and low-risk:

- a comment in `SimulationProvider` or the runtime factory documenting that
  future runtime implementations belong in `infrastructure/`
- a small unit test protecting the runtime-type union from accidental drift

Do not add extra abstraction layers unless they clearly improve the code.

---

## What Not To Do In This Stage

Do not implement:

- Rapier vehicle stepping
- a remote transport protocol
- scenario-level runtime selection unless it is already clearly supported by
  the current design
- UI toggles for runtime selection
- articulated robot support
- URDF import
- generic entity-wide physics runtime

This stage is configuration and stability only.

---

## Deliverables

Implement the code changes and tests.

At the end, provide:

- summary of changes
- files added/updated
- how runtime selection now works
- follow-up work needed for Stage 3

