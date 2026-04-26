# Architecture angelos

> **Note.** This document describes the project **as it stands today**,
> not as it ought to be. The architecture grew organically and several
> layers that should be independent are interleaved. Rough edges are
> called out explicitly in the *Pain points* section so a future
> refactor has something concrete to push against. For a cleaner
> reference design, see `angy_sim_ros2/doc/Architecture.md`.

## What this app is

A single-page React app that renders a top-down 2D car driving on a
30 m × 30 m ground plane with a handful of cylindrical obstacles. The
user drives with IJKL/arrow keys, watches a velocity chart, and can
flip the camera between orbit / top-down follow / heading-locked
follow, perspective / orthographic. There is also a
`/development` route with a 4-cell preview grid for prototyping camera
presets and scene primitives.

The ROS2 part of the name is aspirational — `roslib` is in
`package.json` but unused at the moment.

## Tech & runtime

- React 19 + Vite + TypeScript (strict)
- `@react-three/fiber` + `@react-three/drei` + `three` for 3D
- `react-router-dom` for the App / Development split
- `chart.js` + `react-chartjs-2` for the live velocity chart
- `vitest` for tests (one test file: `SimBase.test.ts`)

## File map

```
src/
  main.tsx                 BrowserRouter, two routes:  /  -> App,  /development -> Development
  App.tsx                  570-line god component: physics + collisions + cameras + key handling + UI
  Development.tsx          /development route — 2×2 preview grid of scene cells
  useSimTick.tsx           Sim-tick store (createContext + useSyncExternalStore + useChartTick)
  VelocityChart.tsx        Chart.js streaming line chart bound to the sim tick
  App.css / index.css      Layout + dark UI

  models/
    SimBase.tsx            Point2D / Point3D classes, Line class, add/sub/scale/distance/equals
    SimMappers.tsx         Point ↔ THREE.Vector*  (direct + scene-frame variants)
    CarState.tsx           Mutable interface { x, y, yaw, v, w, colliding }
    Settings.tsx           empty placeholder

  scene/
    world.tsx              WORLD_TILT, worldToScene/sceneToWorld, WorldFrame, Ground,
                           Arrow, WorldAxes, OriginMarker, Car, Trail, GROUND_SIZE, CAR_RADIUS
    obstacles.tsx          OBSTACLES list, Obstacle, Obstacles, OBSTACLE_RADIUS
    SimScene.tsx           Lights + WorldFrame + Ground + grid, plus a SimSceneCell wrapper
    cameras.tsx            Projection, ProjectionCamera, PresetCameraRig, CameraHud,
                           CAR_CAM_PRESETS / CAR_CAM_BUTTONS / PROJECTION_BUTTONS

  test/
    SimBase.test.ts        Unit tests for the Point/Line math only
```

## Layers (such as they are)

The code is informally organized into three groups, but the boundaries
are leaky.

### 1. Math primitives — `src/models/`

- **`SimBase.tsx`** — `Point` interface, `Point2D` / `Point3D` /
  `Line` classes, and free functions `add`, `sub`, `scale`,
  `distance`, `equals`. Immutable values; ops always return `Point3D`
  (even when both inputs are 2D), which is convenient but loses type
  information.
- **`SimMappers.tsx`** — bridges `Point*` to `THREE.Vector*`. Comes in
  two flavors: *direct* (use inside `<WorldFrame>`) and *scene-space*
  (use outside, applies the world→scene rotation).
- **`CarState.tsx`** — a deliberately mutable interface so the
  simulation loop can mutate it in place inside a `useRef`. The file's
  comment explicitly notes that promoting it to a class would touch
  the physics step + collision loop + every reader — i.e. there is no
  isolation boundary to make that change behind.

### 2. Scene primitives — `src/scene/`

Reusable Three Fiber components. Most live inside `<WorldFrame>` and
take world-space `(x, y, z)`; a few (lights, cameras) live outside and
require the scene-space mappers.

- **`world.tsx`** owns the world-frame contract:
  - **Convention**: ROS/Gazebo-style — *X forward, Y left, Z up,
    right-handed*.
  - Embeds the world frame in the scene via a single
    `<group rotation={[-π/2, 0, 0]}>`. World +Y → scene −Z, world +Z →
    scene +Y. `worldToScene` / `sceneToWorld` formalize the mapping.
  - Solid objects: `Ground`, `Arrow`, `WorldAxes`, `OriginMarker`,
    `Car`, `Trail`. The `Car` reads its pose from a ref every frame
    via `useFrame` — i.e. its position is driven imperatively, not
    through React state.
- **`obstacles.tsx`** — module-level `OBSTACLES` list (eight hard-coded
  `Point2D`s) and an `Obstacles` component that maps over them. The
  `hits` prop is a `ReadonlySet<number>` of currently-colliding
  indices, used for red-tint feedback.
- **`SimScene.tsx`** — composes lights + `<WorldFrame>` + ground +
  grid. `SimSceneCell` adds a default camera + `OrbitControls` for
  the dev preview grid.
- **`cameras.tsx`** — `ProjectionCamera` (perspective/ortho with a
  `key` remount on toggle), `PresetCameraRig` (snaps to a preset on
  key change), `CameraHud` (writes camera state to a DOM ref at ~10 Hz
  to avoid React re-renders), and the `CAR_CAM_PRESETS` table of
  canonical orbit/top/front/side/rear views.

### 3. App — `src/App.tsx` (570 lines)

This is where the architecture breaks down. A single file contains:

- A **wrap-angle utility** (defined inline; not in `models/`).
- **`useKeyboard`** — global `keydown`/`keyup` listeners feeding a
  `Set<string>` ref of currently-held keys.
- **`CameraFollower`** — a ~200-line `useFrame` driver that mixes:
  - mode switching between `orbit` / `follow` / `follow-rotate`
  - perspective↔orthographic toggle
  - per-mode camera position + lookAt + up
  - saved-orbit-pose restore (so re-entering orbit returns to the
    user's last orbit view, not a hardcoded default)
  - orthographic frustum auto-fit (projects the four ground-plane
    corners through the inverse camera matrix to pick the zoom that
    fits them with a margin)
  - a `frozen` flag that pauses camera updates entirely
- **`CarSimScene`** — *the* god component:
  - reads the keyboard, runs the unicycle physics step
    (`yaw += w·dt`, `x += v·cos(yaw)·dt`, `y += v·sin(yaw)·dt`)
  - resolves circle-vs-circle collisions against `OBSTACLES`
    in-place, then pushes the car along the contact normal
  - tracks collided indices via a **bitmask** so the React `Set` is
    only re-allocated when the mask changes (the `EMPTY_COLLIDED_SET`
    constant + `hitMaskRef` exist purely to satisfy `Object.is`
    bail-outs in React)
  - throttles `setTrail` and `onHudUpdate` to every third frame
  - handles edge-triggered C / X / V / P key shortcuts via a small
    forest of `*WasDown.current` refs
  - mounts the camera, OrbitControls, the trail, the obstacles, the
    car, and `CameraFollower`
- **`Dashboard`** — sim-time text + the velocity chart.
- **`App`** — the page shell: split layout, HUD, three toolbar
  buttons (controls help / lock camera / freeze camera), and the
  `Canvas`.

There is no engine, no clock, no scenario, no event bus, no system
abstraction. Every responsibility above lives directly in `useFrame`
callbacks inside `CarSimScene`.

### 4. Sim tick — `src/useSimTick.tsx`

Tiny external store with a `tick` counter, `useSyncExternalStore`
subscribers, and a `useChartTick(frequency)` helper that only emits
every Nth tick. This is the only piece of the app that resembles a
proper engine boundary: the simulation increments it once per
`useFrame`, and the chart subscribes without re-rendering on every
tick. It's not used as a clock anywhere else.

## Frame & coordinate convention

- World is right-handed: **X forward, Y left, Z up** (ROS/Gazebo).
- Three.js renders Y-up. The world is rotated into Three's frame
  inside `<WorldFrame>`; everything inside it can use `(x, y, z)`
  world coords directly.
- Anything **outside** `<WorldFrame>` (the camera, lights, the
  `gridHelper`, OrbitControls' `target`) lives in scene space and
  must go through `pointToScene*` / `sceneVector3ToPoint3D`.

This split is workable but easy to get wrong, and it's enforced only
by convention and code comments — not by the type system.

## Sample data

- `OBSTACLES` (8 points) and `OBSTACLE_RADIUS` (0.15 m) live in
  `scene/obstacles.tsx` — there is no scenario file or loader.
- The car spawns at the world origin with zero velocity.
- `GROUND_SIZE` (30 m) and `CAR_RADIUS` (0.3 m) are hardcoded in
  `scene/world.tsx`.
- `CAR_CAM_PRESETS` (5 presets) and `CAR_CAM_OBSTACLES` (4 corner
  blocks) live in `cameras.tsx` and `Development.tsx` respectively.

## Tests

`src/test/SimBase.test.ts` (~220 lines) covers `Point2D` / `Point3D` /
`Line` and the math operations only. **There are no tests for the
physics step, collision resolution, camera follower, sim-tick store,
or scenario loading** (there is no scenario loader). Anything that
involves Three Fiber is implicitly untested.

## Pain points / smells

These are the things that make the architecture feel "flaky". They
are honest descriptions of the current code, not value judgments.

1. **No engine layer.** Physics, input, collisions, camera state,
   rendering, throttling, mode switching, and UI live in the same
   component (`CarSimScene` inside `App.tsx`). There is nothing to
   import in a Node test, no `update(dt)` you can call from outside
   Three Fiber, and no way to fast-forward or step deterministically.
2. **Render-coupled "models".** `SimBase.tsx` doesn't depend on
   Three.js, but `SimMappers.tsx` does, and `world.tsx` exports the
   only canonical `worldToScene` / `sceneToWorld` — the mappers
   import from `world.tsx`, which means the math layer transitively
   depends on rendering. `world.tsx`'s `Trail` even inlines a tuple
   conversion explicitly to dodge an import cycle (`world →
   mappers → world`).
3. **State scattered across mutable refs.** `stateRef`, `trailRef`,
   `hitMaskRef`, `prevCar`, `prevMode`, `forceInit`,
   `savedOrbitPose`, `cWasDown`, `xWasDown`, `vWasDown`, `pWasDown`,
   `frameCount` — each is a fix for a specific re-render or
   ordering issue. Nothing wrong with refs, but there's no abstraction
   that says *"this is the simulation state, this is the camera
   state, this is the input edge state"* — it's all mixed.
4. **Two parallel notions of position.** Inside the unicycle step
   the code does raw arithmetic on `s.x`, `s.y`, `s.yaw`. For
   collision feedback it reaches for `Point2D` + `distance` /
   `sub` / `scale`. The class-based math API is partially used.
5. **`Settings.tsx` is empty.** Leftover from a previous direction.
6. **Edge-triggered keys re-implemented in line.** `cWasDown` /
   `xWasDown` / `vWasDown` / `pWasDown` are four copies of the same
   "key just went down this frame" pattern, all in `useFrame`.
7. **Camera concerns dominate `App.tsx`.** `CameraFollower` is ~200
   lines; the rest of `App.tsx` is the simulation. Camera mode and
   projection are first-class app concerns mixed with physics.
8. **No deterministic clock or pause.** `DT = 1/60` is hardcoded;
   simulation time is `tick * DT`. There is no way to pause physics
   while keeping the camera live (or vice versa). The `cameraFrozen`
   button only freezes the camera.
9. **No event bus / no decoupling.** Collisions are reported by
   updating a `Set` of indices that the obstacles component reads.
   There's no "collision happened" event the chart, HUD, or any
   future logger could listen to.
10. **`roslib` imported but unused.** Dependency listed; no socket,
    no topics, no bridge.
11. **Single test file.** Math primitives only; everything that
    matters at runtime is untested.

## What a clean-up would look like (informal)

If the project were to evolve, the natural splits — based on what
already exists — would be:

- Lift the unicycle step + collision resolution into a pure
  `simulation/` layer (no `useFrame`, no Three imports). Pass `dt`
  in. Expose `start / pause / step / reset` and a typed event bus.
- Promote `CarState` to a proper class (the comment in
  `CarState.tsx` already plans for this) so the simulation owns its
  own state and the React layer subscribes via
  `useSyncExternalStore`.
- Move `worldToScene` / `sceneToWorld` and the `WorldFrame` rotation
  out of `scene/world.tsx` into a `render/` adapter, so the math
  layer can drop its dependency on rendering. Document the
  handedness mapping per-renderer (cf. `Considerations.md` in
  `angy_sim_ros2`).
- Externalize obstacles + initial pose into a JSON scenario; build a
  loader.
- Pull `CameraFollower` and `useKeyboard` out of `App.tsx` into
  their own files. The edge-triggered keys want a shared utility.
- Add a deterministic `Clock` + a fixed-step `Loop` so simulation
  time is something you can pause and step independently of
  `useFrame`.
- Add tests for the physics step and the collision resolver — both
  are pure functions of `(state, dt, obstacles)` once they're
  extracted.

The `angy_sim_ros2` project in this same workspace is essentially a
greenfield take on the above split.
