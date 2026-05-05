# Three.js Coordinate Mapping Guard Agent Prompt

Use this prompt when refactoring the Three.js renderer coordinate handling to
prevent future simulation-frame / Three.js-frame mismatches.

This prompt assumes:

- `doc/Architecture.md`, `doc/Development_Guide.md`, and `doc/Plugins.md` are
  the source of truth.
- `src/ui/renderers/three/mapping/simToThree.ts` is the single source of truth
  for simulation-to-Three.js coordinate mapping.

---

## Agent Role

You are an architecture-focused implementation agent for `angy_sim_ros2`.

Your task is to introduce a small Three.js renderer wrapper/API that makes the
documented simulation-to-Three.js mapping the default path for all renderer code
that consumes simulation data.

The goal is prevention: future renderer and plugin work should not accidentally
publish simulation `{ x, y }`, yaw, vectors, paths, trajectories, pose arrays,
or debug artifacts directly into raw Three.js coordinates.

---

## Coordinate Contract

The simulation frame is:

```text
+X right
+Y forward
+Z up
```

Three.js must use the documented mapping:

```text
sim.x -> three.x
sim.y -> -three.z
sim.z -> three.y
yaw   -> rotation.y = yaw
```

Therefore a 2D simulation point on the simulation X/Y plane:

```ts
{ x, y }
```

must become:

```ts
new THREE.Vector3(x, height, -y)
```

but renderer code should not write that formula directly. It must go through
`simToThree.ts` or the new wrapper introduced by this refactor.

---

## Problem To Prevent

Previous renderer code bypassed the mapping helpers and used raw Three.js
coordinates directly, for example:

```ts
new THREE.Vector3(x, y, 0)
mesh.position.set(x, y, height)
arrow.rotation.set(0, 0, yaw)
```

That is incorrect for simulation data in this project. It can draw 2D
simulation elements in a vertical plane, rotate headings around the wrong axis,
or apply height to depth instead of vertical/up.

---

## Objective

Introduce a small, reusable Three.js sim-transform API that makes correct
mapping easy and centralizes the remaining renderer-side conversion patterns.

The wrapper must delegate to:

```text
src/ui/renderers/three/mapping/simToThree.ts
```

It must not duplicate mapping formulas in multiple files.

---

## Architecture Constraints

Follow these rules strictly:

- Do not modify the simulation core behavior.
- Do not modify `src/math`.
- Do not change the simulation coordinate convention.
- Do not change physics, entities, trajectory tracking, collision logic,
  recording, or replay behavior.
- Keep renderers read-only consumers of `SimulationState`.
- Keep all Three.js-specific code under `src/ui/renderers/three/`.
- Do not introduce React, Phaser, DOM, ROS, rosbridge, roslib, or plugin imports
  into `src/simulation` or `src/math`.
- Preserve `src/ui/renderers/three/mapping/simToThree.ts` as the source of
  truth.
- The new wrapper must call `simToThree.ts`; it must not become a second source
  of coordinate formulas.

---

## Suggested Implementation

Add a helper module:

```text
src/ui/renderers/three/mapping/ThreeSimTransform.ts
```

Include high-level helpers such as:

```ts
setSimPosition2D(object, point, height = 0): void
setSimPose2D(object, pose, height = 0): void
setSimYaw(object, yaw): void
simPolyline2DToThreePositions(points, height = 0): Float32Array
simSegment2DToThreePoints(start, end, height = 0): [THREE.Vector3, THREE.Vector3]
```

These helpers should internally use:

- `simPoint2DToThree`
- `simPoint3DToThree`
- `simVector2DToThree`
- `simVector3DToThree`
- `simDirection3DToThree`
- `simYawToThreeRotationY`

Prefer names that encode intent. Renderer code should read like:

```ts
setSimPose2D(mesh, pose, height)
```

instead of:

```ts
mesh.position.copy(simPoint2DToThree(pose.position, height))
mesh.rotation.set(0, simYawToThreeRotationY(pose.yaw), 0)
```

Both are correct, but the wrapper reduces repeated low-level transform code and
makes mistakes harder to write.

---

## Refactor Scope

Refactor existing Three.js renderers to use the new wrapper where appropriate:

- `src/ui/renderers/three/objects/ThreeTrajectoryRenderer.ts`
- `src/ui/renderers/three/objects/ThreePathRenderer.ts`
- `src/ui/renderers/three/objects/ThreePoseArrayRenderer.ts`
- `src/ui/renderers/three/debug/HeadingArrowRenderer.ts`
- `src/ui/renderers/three/debug/VelocityVectorRenderer.ts`
- `src/ui/renderers/three/debug/BoundingOutlineRenderer.ts`
- Any other Three.js object/debug renderer that consumes simulation
  coordinates.

Do not refactor local Three.js geometry builders unnecessarily.

Raw `new THREE.Vector3(...)`, direct `.position.set(...)`, and direct rotation
assignment are acceptable only for:

- Local mesh geometry.
- Local basis vectors.
- Three-native lights.
- Camera internals.
- Tests.
- The mapping module itself.
- The new transform wrapper.

When raw Three.js coordinates are intentionally used, add a short comment
explaining that the value is local/Three-space and not simulation-frame data.

---

## Tests To Add Or Update

Add unit tests for the new `ThreeSimTransform.ts` helpers:

- `setSimPosition2D` maps `{ x: 1, y: 2 }` at height `h` to `(1, h, -2)`.
- `setSimYaw` writes `rotation.y`, not `rotation.z`.
- `setSimPose2D` sets both mapped position and mapped yaw.
- `simPolyline2DToThreePositions` produces `[x, h, -y]` triples.
- `simSegment2DToThreePoints` maps both endpoints through `simPoint2DToThree`.

Update renderer tests where useful:

- Trajectories render on the horizontal Three.js ground plane.
- Planned/reference paths render on the horizontal Three.js ground plane.
- Pose-array arrows render on the horizontal Three.js ground plane.
- Debug arrows, velocity vectors, and bounding overlays use mapped positions and
  mapped yaw.

If practical, add an architecture/grep-style test that flags suspicious raw
coordinate conversions in Three.js renderers:

- `.position.set(`
- `new THREE.Vector3(`
- `.rotation.set(0, 0,`
- `.rotation.z =`

Allow exceptions for:

- `src/ui/renderers/three/mapping/simToThree.ts`
- `src/ui/renderers/three/mapping/ThreeSimTransform.ts`
- local geometry builders such as `createArrow.ts`
- tests
- explicitly documented local/Three-space usages

---

## Plugin Documentation Requirement

Update `doc/Plugins.md` if needed so future plugin renderers follow this rule:

- Three.js plugin renderers must use the new sim-transform wrapper when
  consuming simulation-frame data.
- Plugins must not publish simulation coordinates directly into Three.js
  objects.

---

## Pre-Implementation Validation

Before implementing, explicitly validate:

1. No forbidden imports are introduced in `src/simulation` or `src/math`.
2. Renderer code remains read-only and does not mutate `SimulationState`.
3. The wrapper delegates to `simToThree.ts` and does not create a second source
   of truth.
4. Existing ground grid, vehicle, obstacle, trajectory, path, pose-array, debug
   arrow, velocity vector, and bounding overlay rendering semantics are
   preserved.
5. Recording and replay behavior remain unchanged.

---

## Verification

Run:

```bash
npx tsc --noEmit
node_modules/.bin/vitest run
```

If the repository uses additional lint commands, run the relevant renderer and
architecture tests as well.

---

## Report Back

After implementing, report:

1. Which raw conversions were replaced.
2. Which raw `THREE.Vector3(...)`, `.position.set(...)`, or direct rotation
   usages remain and why they are valid.
3. Which tests were added or updated.
4. Typecheck and test-suite results.

