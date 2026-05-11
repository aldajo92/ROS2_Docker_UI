# URDF + Rapier Integration Proposal

This document proposes a staged integration path for URDF-based robot
representation and physics inside `angy_sim_ros2`.

It is intentionally written against the current architecture of the project:

- `src/simulation/` owns simulation state and system updates.
- `src/ui/` owns rendering.
- `src/infrastructure/` owns heavy vendor integrations such as Rapier and
  rosbridge.

The goal is to avoid turning URDF import into an ad hoc renderer feature or a
ROS-only feature. Instead, the simulator should gain a first-class internal
robot-model pipeline that can later be fed by scenario JSON, UI actions, or
ROS 2.

---

## Problem Statement

The current simulator supports:

- kinematic `VehicleEntity` motion using a unicycle model
- simple dynamic actors
- 2D collision backends
- Three.js and Phaser renderers
- rosbridge topic integration

The simulator does **not** currently support:

- articulated rigid-body robots
- joints as simulation-owned runtime state
- link inertias and masses as simulation truth
- URDF-driven collision geometry as simulation truth
- persistent Rapier-owned rigid-body dynamics

As a result, loading a URDF visually is straightforward, but using a URDF as
the source of truth for robot physics requires a broader architecture change.

---

## Key Conclusion

URDF is a suitable source format for:

- robot kinematic structure
- collision geometry
- mass and inertia metadata
- visual meshes
- joint limits and axes

However, URDF alone does not provide simulation behavior. To make URDF drive
physics in this project, the simulator needs a runtime layer that converts URDF
descriptions into simulation-owned robot instances and a physics backend that
can maintain their state over time.

For this project, Rapier is the most natural candidate for that backend, but it
must evolve from a collision-only adapter into a persistent articulated-robot
physics service.

---

## Recommended Direction

Use a staged approach.

### Phase 1: URDF as Visual + Collision Asset

Purpose:

- prove import, scale, orientation, and asset-loading workflow
- keep the current simulation core stable

Behavior:

- load URDF meshes in the Three.js renderer
- anchor the root of the imported model to an existing simulation entity
- optionally extract simplified collision shapes for coarse collision use
- do **not** make URDF the source of truth for dynamics yet

Result:

- the simulator can spawn and display realistic robot models
- current `VehicleEntity` and command flow remain unchanged

### Phase 2: Simulation-Owned Robot Model

Purpose:

- introduce a robot abstraction that is independent from rendering and ROS

Add a new internal concept, for example:

```ts
export interface RobotModelSpec {
  id: string
  source: {
    kind: 'urdf'
    uri: string
  }
}

export interface RobotInstanceSpec {
  id: string
  modelId: string
  pose: { x: number; y: number; yaw: number }
}
```

This phase should define:

- robot model metadata
- robot instance lifecycle
- joint-state storage
- link hierarchy metadata

The important rule is that this model must remain simulation-owned and
JSON-safe where possible. Rendering code should not parse URDF directly as the
only representation of the robot.

### Phase 3: Frame Transform Layer

Purpose:

- support `map`, `odom`, `base_link`, sensor frames, and future TF integration

Why it matters:

- URDF defines robot-local link/joint transforms
- ROS topics often carry `frame_id`
- sensors and visual artifacts may need normalization into a fixed frame

This phase should follow the existing frame-transform proposal in:

- `doc/Refactor/FrameTransformArchitectureAgentPrompt.md`

Frame transforms are not the whole URDF/physics problem, but they are a
necessary supporting layer once robot links, sensors, and ROS topics must share
consistent frames.

### Phase 4: Persistent Rapier Physics for Robots

Purpose:

- make robot state come from the physics engine rather than from ad hoc entity
  update logic

This is the phase where URDF starts to matter physically.

Needed capabilities:

- one persistent Rapier world, not one temporary world per collision query
- rigid bodies per link where needed
- colliders derived from URDF collision geometry
- joints/constraints derived from URDF joint structure
- body mass/inertia derived from URDF inertial blocks where possible
- synchronization from Rapier state back into simulation-owned runtime state

This phase should **not** overload `VehicleEntity`. Instead, introduce a new
runtime path for articulated robots.

---

## Why Not Make ROS 2 the Spawn Owner

Spawning a robot from URDF should not initially depend on ROS 2.

Recommended ownership model:

- the simulator owns robot spawning
- scenarios and UI can request a spawn
- ROS 2 may later become another producer of the same internal spawn command

This preserves the current architecture:

- simulation core owns world state
- infrastructure owns transport adapters
- ROS 2 remains optional rather than mandatory

---

## Proposed Architecture

### 1. Internal Model Layer

Add a simulation-owned robot-model module:

```text
src/simulation/robots/
  RobotModelSpec.ts
  RobotInstance.ts
  RobotRegistry.ts
  JointState.ts
  SpawnRobotCommand.ts
  SpawnRobotQueue.ts
```

Responsibilities:

- store robot model metadata
- store spawned robot instances
- store joint states
- expose spawn/remove/update lifecycle

This layer must not import Three.js, React, rosbridge, or Rapier directly.

### 2. URDF Import Layer

Add infrastructure code that reads URDF and converts it into an internal robot
description:

```text
src/infrastructure/robot_models/urdf/
  UrdfRobotModelLoader.ts
  UrdfToRobotModelAdapter.ts
  UrdfCollisionShapeAdapter.ts
```

Responsibilities:

- parse URDF
- normalize links/joints
- extract collision and inertial data
- produce simulation/infrastructure-friendly structures

This layer may depend on the chosen URDF library.

### 3. Rendering Layer

Three.js-only robot visual support:

```text
src/ui/renderers/three/objects/
  ThreeRobotModelRenderer.ts
  ThreeUrdfRobotVisual.ts
```

Responsibilities:

- render robot visuals
- bind renderer objects to simulation-owned robot instances
- update visual transforms from simulation state

Renderers must not become the only owner of robot structure.

### 4. Physics Layer

Add a dedicated Rapier robotics integration:

```text
src/infrastructure/physics/rapier/
  RapierRobotWorld.ts
  RapierRobotInstance.ts
  RapierJointMapper.ts
  RapierColliderMapper.ts
  RapierInertialMapper.ts
```

Responsibilities:

- persistent physics world
- robot rigid-body creation
- collider creation
- joint creation
- stepping and pose extraction

This should be separate from the current collision-only backend.

---

## Simulation Contract Changes

The current contract is built around:

- `VehicleEntity.update(dt, state)`
- `VehicleDynamicsSystem`

That is appropriate for simple kinematic vehicles, but not for articulated
robots whose state is driven by a physics engine.

Recommended addition:

```text
src/simulation/systems/
  RobotPhysicsSystem.ts
```

Possible responsibilities:

- drain spawn/despawn queues
- advance Rapier world
- project resulting root/link/joint state back into simulation-owned state
- emit events if needed

Important rule:

- the simulation core should still own the authoritative runtime state exposed
  to UI and communication layers
- Rapier may compute that state, but it should not leak directly into React or
  renderers

---

## 2D vs 3D Scope

This is a major design choice.

### Option A: 2D Robot Physics First

Pros:

- fits the current architecture better
- works with current collision assumptions
- lower implementation cost

Cons:

- URDF is inherently richer than a 2D projection
- many articulated behaviors become approximated or discarded
- z, roll, pitch, and full 3D collision are ignored

Use this if the short-term goal is differential-drive mobile robots moving on a
plane.

### Option B: Full 3D Robot Physics

Pros:

- more faithful URDF use
- closer to Gazebo / Isaac-style robot simulation
- better long-term foundation for manipulators and sensor mounts

Cons:

- requires a much larger architecture shift
- likely needs Rapier 3D or another 3D physics backend
- render, collision, and state assumptions across the project need review

Use this if the long-term goal is general robotics simulation, not just planar
mobile robots.

### Recommendation

Start with **2D-rooted architecture plus 3D visuals**, then decide whether to
expand into full 3D physics after the runtime robot model exists.

That means:

- render the full URDF visually in Three.js
- keep root motion planar at first
- allow link/joint representation in data structures
- postpone full 3D rigid-body simulation until the model/runtime boundaries are
  stable

---

## Proposed Spawn Contract

The simulator should gain an internal robot spawn command independent of ROS:

```ts
export interface SpawnRobotCommand {
  id: string
  model: {
    kind: 'urdf'
    uri: string
  }
  pose: {
    x: number
    y: number
    yaw: number
  }
  physics?: {
    enabled?: boolean
    mode?: 'kinematic' | 'rapier'
  }
}
```

Possible producers:

- scenario loader
- UI actions
- tests
- future ROS adapter

This keeps world composition owned by simulation logic, not by transport code.

---

## Scenario Support

Longer term, support robot spawn in scenario JSON.

Example direction:

```json
{
  "robots": [
    {
      "id": "ego",
      "model": {
        "kind": "urdf",
        "uri": "models/turtlebot3_burger.urdf"
      },
      "pose": { "x": 0, "y": 0, "yaw": 0 },
      "physics": {
        "enabled": true,
        "mode": "kinematic"
      }
    }
  ]
}
```

Suggested rollout:

- first support scenario-declared visual spawn
- then support scenario-declared physics mode

---

## Rapier Integration Strategy

### Current State

Current Rapier usage is collision-only:

- temporary world
- fixed bodies
- no persistent robot state
- no dynamic stepping ownership

### Target State

Add a separate persistent Rapier runtime for robots:

- persistent world instance
- long-lived robot bodies/colliders/joints
- stepping once per tick
- clear sync boundary back into simulation state

Do **not** overload `RapierCollisionBackend2D` with all of this.

That file should remain a collision backend. Robot physics deserves its own
module and lifecycle.

---

## Risks

### 1. URDF Library Scope Mismatch

Some URDF loaders are primarily visual importers. They may help with link/joint
trees and meshes but still leave significant work for:

- inertial parsing
- collision-shape extraction
- joint-runtime mapping
- non-mesh primitive handling

### 2. Renderer Becoming the Real Model Owner

If the first implementation lives only inside Three.js, the simulator will gain
"robots you can see" but not "robots the simulation owns." Avoid this.

### 3. Mixing Kinematic and Physics Ownership

If both `VehicleEntity.update()` and Rapier try to own the same pose, bugs are
very likely. Choose one authority per robot instance.

### 4. 2D/3D Drift

If root motion, collision, and visuals all use different subsets of URDF
semantics without explicit policy, the simulator will become hard to reason
about. Document what is projected away.

---

## Recommended First Milestone

Build a thin but clean vertical slice:

1. Add `doc/`-backed architecture notes for robot model support.
2. Add simulation-owned spawn command and registry for robot instances.
3. Load one URDF into Three.js as a visual representation of a spawned robot.
4. Bind the URDF root to a planar simulation pose.
5. Keep physics mode `kinematic` only for the first milestone.

This gives:

- concrete progress
- no premature commitment to full articulated dynamics
- a clean path toward Rapier-backed robot physics later

---

## Recommended Second Milestone

Introduce a persistent Rapier robot runtime for planar robots:

- root rigid body
- coarse colliders from URDF
- optional simplified joint support
- simulator state synchronized from Rapier

At this stage, use URDF collision and inertial data selectively rather than
trying to support the full URDF feature set immediately.

---

## Final Recommendation

Use URDF as the canonical robot-description input format, but do not treat it
as a direct runtime model.

The best architecture for this project is:

- URDF as import format
- simulation-owned robot model as runtime contract
- Rapier as optional persistent physics backend
- ROS 2 as an optional producer/consumer, not the owner of robot existence

Frame transforms are necessary for a complete robotics stack, but they are only
one part of the solution. The larger change is introducing a robot runtime that
can bridge:

- URDF structure
- simulation state
- renderer visuals
- Rapier physics
- future ROS interfaces

