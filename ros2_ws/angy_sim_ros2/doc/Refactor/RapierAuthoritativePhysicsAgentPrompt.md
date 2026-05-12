# Rapier Authoritative Physics Agent Prompt

Use this prompt to evolve Rapier support in `angy_sim_ros2` from a
physics-backed integrator scaffold into the first **authoritative collision
response runtime**.

The project already supports multiple motion runtimes:

- `kinematic`
- `rapier`
- `remote`

At the moment:

- `kinematic` is the long-standing idealized mode
- `rapier` uses Rapier structure and stepping, but is not yet the source of
  truth for collision response
- collisions are still observed separately by `CollisionSystem`
- users can reasonably expect the `rapier` mode to behave more physically than
  it currently does

This task should make that expectation true in a controlled, technically honest
way.

---

## Core Intent

Preserve two clearly different simulator modes:

### 1. `kinematic`

This mode must continue to behave as the simulator has behaved historically:

- direct/idealized vehicle motion
- deterministic and control-friendly
- collision detection may still be reported
- collisions do **not** need to produce physical response

In short:

**keep `kinematic` behavior functionally unchanged**

### 2. `rapier`

This mode must become the first **authoritative physics runtime**:

- Rapier owns the physical vehicle poses during the tick
- contact response is resolved by Rapier
- straightforward overlap / pass-through between supported 2D bodies should be
  prevented
- readback into simulation-owned normalized state still happens through the
  runtime contract

In short:

**`rapier` should stop being “Rapier-shaped kinematics” and become real
collision-resolving 2D physics**

---

## Read First

Inspect these files before changing anything:

- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/physics/KinematicVehicleMotionRuntime.ts`
- `src/infrastructure/physics/rapier/RapierVehicleMotionRuntime.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/simulation/systems/CollisionSystem.ts`
- `src/infrastructure/collision/rapier/RapierCollisionBackend2D.ts`
- `src/simulation/entities/VehicleEntity.ts`
- `src/simulation/entities/DynamicActorEntity.ts`
- `src/simulation/scenarios/Scenario.ts`
- `src/simulation/scenarios/ScenarioLoader.ts`
- `src/app/buildVehicleMotionRuntime.ts`
- `src/app/buildVehicleMotionRuntimeAsync.ts`
- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Prompt.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Stage3_Claude_Prompt.md`

If relevant, also inspect:

- entity shapes / radius definitions
- collision shape builders
- any scenario entity schema that currently defines size or geometry

---

## Objective

Implement the next evolution of Rapier support so that:

1. `kinematic` remains the current non-physical baseline mode
2. `rapier` becomes a real collision-resolving runtime
3. Rapier becomes the source of truth for resolved vehicle motion in `rapier`
   mode
4. supported 2D colliding bodies do not simply pass through one another or sit
   trivially overlapped under normal supported conditions

Do **not** overpromise “perfect real-world physics”.

The target is:

**authoritative 2D rigid-body collision response for the current simulator’s
supported planar scenarios**

---

## Important Framing

Do not treat this as a tiny bug fix.

This is a semantic upgrade of `rapier` mode:

- `kinematic` stays idealized
- `rapier` becomes physically resolved

That means the two modes are allowed to produce different trajectories, and that
is expected.

---

## Hard Constraints

Follow these rules strictly:

- Do not change the intended behavior of `kinematic`
- Do not import Rapier into `src/simulation/`
- Keep Rapier implementation in `src/infrastructure/`
- Keep `VehicleDynamicsSystem` runtime-agnostic
- Keep `VehicleEntity` free of Rapier-specific imports
- Do not mix this task with URDF
- Do not mix this task with frame-transform work
- Do not mix this task with remote runtime work
- Do not redesign the entire simulator into a universal physics architecture
  unless a very small helper is obviously needed

---

## Expected Scope

Focus on **2D planar rigid-body collision behavior** for the current simulator.

Acceptable simplifications:

- one rigid body per vehicle
- simple collider geometry (e.g. circles or other current internal shapes)
- persistent Rapier world
- default physical parameters when scenario/entity data does not provide them
- simple control mapping from current commands into physics behavior

Out of scope:

- URDF-driven rigid-body trees
- articulated joints
- 3D physics
- complex wheel/tire models
- full sensor physics
- remote backend work

---

## What “Correct Enough” Means Here

The goal is not perfect physical realism.

The goal is:

- when using `rapier`, the physics world should be authoritative for pose
  evolution
- collisions should be resolved by Rapier’s contact/solver pipeline
- obvious overlap/passthrough between supported colliding bodies should be
  prevented
- objects should no longer behave as if collision is merely observed after the
  fact

Phrase your own implementation choices around:

**supported 2D scenarios**

not around universal guarantees.

---

## Key Design Decision You Must Make

Decide whether to:

1. refactor the current `RapierVehicleMotionRuntime` in place
2. or replace it with a clearer implementation while preserving the same public
   runtime role

Either is acceptable if the final architecture remains clean.

But the resulting `rapier` runtime must no longer rely on the old “kinematic
velocity body + separate collision observation” mindset as its main semantic
model.

---

## Required Technical Outcomes

### 1. Rapier must own the physical pose evolution in `rapier` mode

At the end of each tick in `rapier` mode:

- vehicle poses should come from Rapier bodies
- not from a parallel kinematic pose update path

### 2. Collision response must come from Rapier

In `rapier` mode, collisions must no longer be “detected only”.

Rapier should resolve contact in the physical world for the supported bodies.

### 3. Physical body properties must exist where needed

If collision response requires additional physical properties, add them in a
minimal and well-documented way.

Examples:

- mass
- collider radius or dimensions
- friction
- restitution
- damping
- body type assumptions

Defaults are acceptable if the project does not currently model these.

### 4. Supported bodies should not straightforwardly overlap

Do not promise impossible perfection, but the result should prevent the obvious
case where two colliding bodies simply occupy the same space while `rapier` mode
is active.

### 5. Kinematic mode must remain stable

Do not regress:

- existing default behavior
- deterministic idealized use cases
- historical motion semantics of `kinematic`

---

## Questions Your Implementation Must Answer

Your implementation must answer these in code:

1. What Rapier body type is used for vehicles in the new `rapier` mode?
2. How are `v` / `w` or equivalent motion commands mapped into physical motion?
3. What collider shape is used, and where does its size come from?
4. What mass/inertia assumptions are used?
5. How is resolved state read back into normalized simulation state?
6. What is the role of `CollisionSystem` after this change in `rapier` mode?
7. How are non-vehicle collidable objects handled, if they participate in
   contact with vehicles?

You do not need a perfect final architecture for every future entity type, but
the answers must be coherent for the current repo.

---

## Recommended Direction

This is guidance, not a mandate, but it is the most likely sane route:

### A. Preserve `kinematic` as-is

Do not route `kinematic` through new physical-response semantics.

### B. Use a persistent Rapier world

`rapier` mode should use one persistent world for runtime-owned bodies.

### C. Use persistent rigid bodies and colliders

Each physical object participating in `rapier` contact should have persistent
Rapier objects that are updated/synchronized intentionally.

### D. Let Rapier resolve the contact

Do not merely use Rapier to integrate nominal motion while another layer
pretends to be the source of truth for collision semantics.

### E. Read back normalized state

UI, replay, metrics, and renderers should still consume simulation-owned state
through the existing runtime/system boundaries.

---

## CollisionSystem Guidance

Do not automatically delete or redesign `CollisionSystem` unless it becomes
absolutely necessary.

Instead, choose one of these clean outcomes:

1. `CollisionSystem` remains an observer/event layer, while Rapier is the source
   of truth for physical collision response in `rapier` mode
2. `CollisionSystem` adapts its role depending on runtime mode

Be explicit in comments and final explanation about what remains duplicated and
what has become authoritative.

---

## Scenario / Entity Schema Guidance

If the current entity/scenario model does not provide enough information for
realistic contact response, extend it minimally.

Acceptable additions include defaults for:

- body mass
- collider radius / size
- friction
- restitution

Requirements:

- keep backward compatibility where reasonable
- document defaults clearly
- avoid large schema redesigns

---

## Testing Requirements

Add or update tests that prove the semantic difference between modes.

You must cover at least:

1. `kinematic` mode still behaves as before
2. `rapier` mode now has physical collision response
3. a supported collision scenario in `rapier` mode no longer behaves like simple
   overlap/passthrough
4. Rapier-resolved pose/state is read back correctly through the runtime
5. runtime selection still works through the existing provider/factory path

If you add physical defaults, test them or document them clearly.

---

## Non-Goals

Do not do any of the following in this task:

- URDF support
- articulated-body simulation
- frame transform infrastructure
- remote transport changes
- 3D physics
- large UI redesign
- full generic world-physics abstraction for every future use case

---

## Acceptance Criteria

This task is complete if all of the following are true:

1. `kinematic` remains behaviorally stable
2. `rapier` becomes a physically resolved mode rather than a kinematic-like
   integrator shell
3. Rapier is the source of truth for resolved motion in `rapier` mode
4. supported colliding 2D bodies no longer trivially overlap/passthrough in
   normal tested cases
5. any new physical parameters are introduced cleanly and minimally
6. the runtime-based architecture remains intact
7. tests demonstrate the behavioral difference between `kinematic` and `rapier`

---

## Deliverables

At the end:

1. implement the new authoritative Rapier physics behavior
2. add/update tests
3. explain:
   - what changed
   - what physical assumptions/defaults were introduced
   - what schema/entity fields were added or defaulted
   - what `CollisionSystem` still does in `rapier` mode
   - what limitations still remain
