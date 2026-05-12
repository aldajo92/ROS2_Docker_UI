# Rapier 3D Authoritative World Agent Prompt

Use this prompt to define and implement the next major simulation architecture
step in `angy_sim_ros2`:

- move from a fundamentally 2D physics model toward an authoritative **3D**
  physics world
- use **Rapier 3D** as the physics backend
- keep **Three.js** as the native 3D renderer
- keep **Phaser** as a **2D projection/view** of that same 3D world rather than
  a separate 2D simulation

This is not a small fix. This is a deliberate architectural expansion.

---

## Core Intent

The current project has already established:

- swappable motion runtimes
- simulation/render separation
- `kinematic`, `rapier`, and `remote` runtime modes
- a path toward stronger physics support

The next step is to stop treating the simulator as fundamentally planar and
instead define a **3D authoritative world model**, even if some views remain 2D.

The guiding principle is:

**one physical world, multiple visual interpretations**

That means:

- Rapier 3D owns the authoritative physical world
- Three.js renders that world directly in 3D
- Phaser renders a top-down or otherwise defined 2D projection of the same
  world state

Phaser must not become a separate 2D simulation fork.

---

## Important Outcome

At the end of this evolution:

1. the simulator’s physical truth lives in 3D
2. Three.js is a native 3D window into that world
3. Phaser is a 2D projected representation of that world
4. `kinematic` may remain a simpler baseline mode if needed
5. the architecture becomes compatible with future URDF / richer robot
   representations much more naturally

---

## Read First

Inspect these first before designing changes:

- `src/simulation/physics/VehicleMotionRuntime.ts`
- `src/simulation/physics/KinematicVehicleMotionRuntime.ts`
- `src/infrastructure/physics/rapier/RapierVehicleMotionRuntime.ts`
- `src/infrastructure/collision/rapier/RapierCollisionBackend2D.ts`
- `src/simulation/entities/VehicleEntity.ts`
- `src/simulation/entities/DynamicActorEntity.ts`
- `src/simulation/core/SimulationState.ts`
- `src/simulation/systems/VehicleDynamicsSystem.ts`
- `src/ui/viewport/SimulationViewportSwitcher.tsx`
- `src/ui/viewport/ThreeSimulationViewport.tsx`
- `src/ui/viewport/PhaserSimulationViewport.tsx`
- `src/ui/renderers/three/...`
- `src/ui/renderers/phaser/...`
- `src/simulation/scenarios/Scenario.ts`
- `src/simulation/scenarios/ScenarioLoader.ts`
- `src/app/App.tsx`
- `src/app/SimulationProvider.tsx`

Use these docs as context:

- `doc/Architecture.md`
- `doc/Development_Guide.md`
- `doc/Proposals/URDF_Rapier_Integration_Proposal.md`
- `doc/Proposals/Vehicle_Motion_Runtime_Prompt.md`
- `doc/Refactor/FrameTransformArchitectureAgentPrompt.md`
- `doc/Refactor/RapierAuthoritativePhysicsAgentPrompt.md`

---

## Objective

Create the architectural path to a **Rapier 3D authoritative physics world**
with the following semantics:

### `kinematic`

May remain the simple baseline mode for idealized control/testing.

### `rapier`

Must evolve toward:

- authoritative 3D rigid-body world
- physical collision response in 3D
- world state read back into normalized simulation state

### Renderers

- **Three.js** consumes the authoritative 3D world natively
- **Phaser** consumes a 2D projection of that same world

---

## Very Important Constraint

Do **not** implement two different physical worlds:

- one 3D for Three
- one 2D for Phaser

That would be the wrong architecture.

Instead:

**one 3D simulation world -> multiple render projections**

---

## Key Product/Architecture Idea

Phaser should be understood as:

- a 2D viewport into a 3D world
- likely top-down
- likely projecting a chosen world plane
- likely preserving only a subset of orientation (for example yaw)

This means the Phaser representation can be intentionally lossy:

- it may ignore `z` in the display
- it may ignore roll/pitch in the display
- it may simplify size/shape cues

That is acceptable.

What is **not** acceptable is allowing Phaser to define a different simulation.

---

## Hard Constraints

Follow these rules strictly:

- keep simulation-owned contracts in `src/simulation/`
- keep Rapier-specific integration in `src/infrastructure/`
- do not import Rapier directly into `src/simulation/`
- do not make renderers own physics
- do not let Phaser become a separate simulation model
- do not mix this with remote runtime work in the same task unless a tiny hook
  becomes necessary
- do not fake “3D” by keeping the same 2D world and merely adding visuals

---

## Scope Framing

This is a significant architecture change, but the implementation should still
be incremental and disciplined.

You do **not** need to solve every downstream 3D concern fully in one pass.

But you do need to establish the right foundations.

Acceptable phased behavior:

- some existing features remain effectively planar while the world model becomes
  3D-capable
- some entities may still default to `z = 0`
- some renderers may project only a subset of 3D state

Not acceptable:

- pretending to have a 3D world while state contracts remain fundamentally 2D
- duplicating simulation logic by renderer

---

## Architectural Questions To Solve

Your implementation/design must answer:

1. What is the canonical simulation pose/state shape in a 3D-capable world?
2. How do existing 2D entities evolve into 3D-capable entities without breaking
   everything at once?
3. How does `VehicleMotionRuntime` evolve to support 3D-authoritative state?
4. How does the Three renderer consume full 3D state?
5. How does Phaser consume a projected 2D representation of the same state?
6. What world axis convention is used?
7. Which plane does Phaser project onto?
8. Which orientation components are preserved for Phaser?
9. How do scenario/entity defaults work for existing planar scenarios?
10. How do collision/physical body properties evolve when moving into 3D?

---

## Recommended High-Level Direction

### A. Introduce 3D-capable simulation-owned state

The core model likely needs to evolve from:

- `x, y, yaw`

toward something like:

- position: `x, y, z`
- orientation: at least a 3D-capable representation

You do not have to immediately rewrite every consumer into full quaternion
literacy if that is too large, but the architecture should clearly head in that
direction.

### B. Preserve backward compatibility for planar scenarios

Existing scenarios should continue to work with reasonable defaults:

- `z = 0`
- no roll/pitch
- top-down semantics preserved

### C. Treat Phaser as a projection layer

Phaser should receive or derive:

- projected 2D position
- projected heading
- optionally projected footprint

from the same authoritative 3D state.

### D. Make Three the native 3D consumer

Three should be the renderer that most directly reflects:

- full 3D position
- full 3D orientation
- full 3D scene interpretation

### E. Move Rapier support to 3D

If `rapier` mode is kept, it should be backed by Rapier 3D, not Rapier 2D.

---

## Expected Structural Changes

You will likely need to introduce or evolve some of the following concepts.

Exact names may vary, but the direction should be explicit:

### 1. 3D pose / transform types

Likely under `src/math/` and/or `src/simulation/`:

- `Pose3D`
- `Vector3`
- `Quaternion` or equivalent
- projection helpers for Phaser/top-down use

### 2. Simulation state evolution

Current normalized state should become 3D-capable without tying itself to
Rapier directly.

### 3. Rapier 3D runtime

Likely a new implementation under something like:

```text
src/infrastructure/physics/rapier3d/
```

or a carefully evolved Rapier runtime layout that clearly separates 2D legacy
from 3D authoritative behavior.

### 4. Projection mapping layer

A clean place must exist for:

- 3D world state -> Phaser-friendly 2D projected state

This should be a mapping concern, not a simulation fork.

### 5. Renderer-side adaptation

Three renderer:

- consume 3D state natively

Phaser renderer:

- consume top-down/projected state

---

## Collision and Physical Properties

If `rapier` is now 3D-authoritative, physical body properties will likely need
to exist in a more explicit way:

- mass
- collider dimensions/shape
- friction
- restitution
- damping
- body type assumptions

These may need to be introduced with defaults.

Keep additions minimal and document them clearly.

Avoid giant schema rewrites if a smaller backward-compatible evolution is
possible.

---

## Coordinate / Projection Guidance

You must make the world convention explicit.

For example:

- choose which axis is “up”
- choose which ground plane is the default motion plane
- define how top-down projection works for Phaser

Examples of acceptable explicit policy:

- Rapier/Three world is `x, z` on the ground plane with `y` as up
- Phaser projects `(x, z)` into `(x, y)` screen/world 2D and uses yaw around
  the up axis

or another consistent convention

The exact choice matters less than being explicit and consistent.

---

## Scenario Compatibility Guidance

Existing planar scenarios should not become unusable.

You should provide a compatibility path such as:

- infer 3D state from old 2D inputs
- default height/orientation values
- clearly document how old scenarios map into the new world

If schema changes are needed:

- keep them minimal
- keep legacy input working where feasible
- document defaults

---

## Render Semantics Guidance

### Three

Three should become the renderer that most faithfully reflects the 3D world.

### Phaser

Phaser should not be expected to represent every 3D nuance.

It is acceptable that Phaser:

- ignores height in the display
- flattens pitch/roll
- shows only a top-down footprint and heading

But those simplifications must come from projecting the same 3D state.

---

## Testing Expectations

Add or update tests that prove the new architecture direction, not just local
implementation details.

You should cover at least:

1. legacy/planar scenarios still load with sane defaults
2. authoritative Rapier mode uses 3D-capable state
3. Three and Phaser consume the same underlying simulation state through
   different mappings
4. Phaser projection logic is deterministic and documented
5. runtime selection still works through the existing provider/factory path

If full integration tests are too large, add focused tests around:

- state mapping
- projection helpers
- runtime readback
- backward compatibility loaders

---

## Non-Goals

Do not attempt all of this in one uncontrolled sweep:

- full URDF articulated robotics
- full TF tree implementation
- every sensor in 3D
- remote runtime redesign
- large visual redesign of the UI
- perfect game-engine-grade world authoring tools

This task is about getting the simulation architecture onto the correct 3D
foundation.

---

## Acceptance Criteria

This effort is successful if:

1. the project now has a clear authoritative 3D world direction
2. Rapier support is aligned with 3D world ownership rather than 2D-only
   assumptions
3. Three renders the world natively in 3D
4. Phaser renders a 2D projection of the same world, not a separate simulation
5. backward compatibility for current planar scenarios is preserved reasonably
6. the architecture is cleaner and closer to future URDF/robot evolution

---

## Deliverables

At the end:

1. implement the architectural changes needed for this 3D direction
2. add/update tests
3. explain:
   - what canonical 3D state model was introduced
   - what coordinate convention was chosen
   - how Phaser projects the 3D world into 2D
   - how existing scenarios remain compatible
   - what limitations still remain
