# Rapier 3D Collision Response Next Stage Agent Prompt

Use this prompt to implement the next stage of `rapier3d` in
`angy_sim_ros2`: move it from an additive 3D runtime spike into the first
version with real physical collision response, while preserving the existing
stable runtimes.

---

## Context

The project already has:

- `kinematic` runtime
- existing `rapier` runtime
- additive `rapier3d` runtime spike

Important current facts:

- `kinematic` must remain unchanged and stable
- `rapier3d` already exists as an additive experimental runtime
- today `rapier3d` still uses `kinematicVelocityBased` bodies and direct
  velocity injection
- as a result, objects can still overlap and do not yet show true physical
  collision response

This next step is specifically about making `rapier3d` behave like a real
physics mode.

Do not replace the current simulator baseline.

Do not turn this into a global 3D rewrite.

---

## Read First

Inspect these first:

- `src/infrastructure/physics/rapier3d/Rapier3DVehicleMotionRuntime.ts`
- `src/infrastructure/physics/rapier3d/Rapier3DVehicleMotionRuntime.test.ts`
- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/app/buildVehicleMotionRuntime.ts`
- `src/app/buildVehicleMotionRuntimeAsync.ts`
- `src/simulation/physics/VehicleMotionRuntimeConfig.ts`
- `src/ui/RendererPanel.tsx`
- `doc/Refactor/Rapier3D_AdditiveRuntime_AgentPrompt.md`
- `doc/Architecture.md`
- `doc/Development_Guide.md`

---

## Objective

Upgrade `rapier3d` so it becomes the first additive runtime with actual
collision-resolving physical behavior, without breaking `kinematic`, `rapier`,
or `remote`.

---

## What Must Remain True

1. `kinematic` stays untouched in behavior.
2. Existing 2D scenarios must still work in `kinematic` exactly as before.
3. `rapier3d` remains additive and explicitly experimental.
4. This work must not require rewriting the whole simulator into a 3D-first
   architecture.

---

## What `rapier3d` Should Gain In This Stage

1. Real contact response from Rapier 3D.
2. Bodies should no longer trivially overlap / pass through one another in
   supported scenarios.
3. Rapier 3D should become the source of truth for resolved vehicle motion in
   this runtime.
4. Vehicle motion commands should be translated into a physically meaningful
   control approach.
5. If necessary, introduce physical defaults such as:
   - mass
   - damping
   - friction
   - restitution
   - collider sizing assumptions
6. Keep backward-compatible defaults so existing scenarios can still be
   interpreted on the ground plane.

---

## Important Scope Constraint

Do not globally replace the existing 2D state contracts just to make this work.

Prefer a local compatibility strategy inside the `rapier3d` runtime and its
mapping layer.

If a bridge/adaptor is needed, add that bridge instead of rewriting unrelated
systems.

---

## Recommended Direction

1. Replace or evolve the current `kinematicVelocityBased` approach in
   `rapier3d`.
2. Use Rapier 3D body/collider semantics that allow actual collision response.
3. Keep the world on the existing ground-plane interpretation for now.
4. Continue projecting the resolved result back into the current normalized
   `VehicleRuntimeState` shape:
   - `pose: { x, y, yaw }`
   - `velocity`
   - `distanceTraveled`
5. Keep Three and Phaser compatibility through that same readback path.
6. Do not attempt full 3D visualization semantics, URDF, or generalized 3D
   entities in this task.

---

## Questions This Implementation Must Answer

1. What body type is now used in `rapier3d`?
2. How are `v` / `w` commands translated into motion?
3. How is contact response achieved?
4. What physical defaults are introduced?
5. How is readback into the existing runtime contract preserved?
6. What limitations still remain after this stage?

---

## Testing Requirements

Add or update tests that prove:

1. `kinematic` still behaves as before.
2. `rapier3d` now shows physical collision response.
3. Two colliding vehicles in `rapier3d` do not simply pass through / overlap in
   the tested case.
4. Runtime readback still produces the expected normalized state shape.
5. Runtime selection and provider wiring still work.
6. Existing non-`rapier3d` paths are not regressed.

---

## Non-Goals

Do not do any of the following in this task:

- full simulator-wide 3D migration
- URDF
- articulated bodies
- remote runtime work
- full Phaser 3D semantics
- broad UI redesign
- replacing the current baseline simulator

---

## Acceptance Criteria

1. `kinematic` remains stable and unchanged.
2. `rapier3d` now has real collision-resolving behavior in supported cases.
3. `rapier3d` remains additive, not destructive.
4. The implementation preserves the current runtime architecture.
5. Tests demonstrate the behavioral difference between `kinematic` and
   `rapier3d`.

---

## Deliverables

At the end, provide:

- summary of changes
- what physical assumptions/defaults were introduced
- what was changed in `rapier3d`
- what limitations still remain
