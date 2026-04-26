Architecture — rendering-agnostic core
src/simulation/ contains the entire simulation engine and is verified to have zero React, Three.js, Phaser, Pixi, or Canvas imports. Same for src/math/. React lives only in src/app/ and src/ui/.

Math primitives (src/math/geometry/)
Classes: Point2D, Point3D, Vector2D, Vector3D, Pose2D, Pose3D, Line2D, Segment2D, Transform2D. Free-function modules operations2D.ts and operations3D.ts contain vectorAdd, vectorSub, vectorScale, vectorDot, vectorCross, vectorLength, vectorNormalize, vectorRotate, vectorAngle, pointAdd, pointSub, pointDistance, wrapAngle, segmentDistanceSq, etc. All immutable; methods return new instances.

Simulation core (src/simulation/core/)
SimulationClock — sim time + last dt, validates dt
SimulationLoop — fixed-step driver via setInterval, supports start/pause/stepOnce and a configurable speedFactor
SimulationState — holds clock, EntityManager, metrics, event bus, logger, current scenario name
SimulationEngine — start(), pause(), reset(), step(), loadScenario(), addEntity, addSystem
SimulationController — UI-facing facade with loadScenarioFromUrl / loadScenarioFromJson
EntityManager — id-keyed Map with add/remove/get/byType/all/toArray
SystemManager — ordered list, runs each system per tick
Entities (src/simulation/entities/)
Entity interface, BaseEntity abstract class
VehicleEntity — semi-implicit unicycle kinematic model (yaw integrates first, then position uses the new heading)
StaticObstacleEntity — circle at a fixed position
DynamicActorEntity — holonomic moving obstacle
Systems (src/simulation/systems/)
SimulationSystem interface
VehicleDynamicsSystem — drives vehicles + dynamic actors, accumulates peak speed and total distance
CollisionSystem — naive O(n²) circle-vs-circle, fires collision event on pair leading edge only
MetricsSystem — placeholder for cross-cutting derived metrics
ScenarioSystem — fires time-scheduled scenario events
Scenarios (src/simulation/scenarios/)
Scenario.ts — pure type definitions, JSON-friendly
ScenarioLoader — parse(json), loadFromUrl(url), buildEntity(spec), with strict validation and a ScenarioParseError type
Render / Events / Logging
SimulationRenderer — interface only (init, render, dispose); no implementation
EventBus + TypedEventBus — generic typed pub/sub keyed by an EventMap
SimulationEvents — typed map for tick/started/paused/reset/scenarioLoaded/collision/entityAdded/entityRemoved
Logger — pluggable sink, level-filtered, console-backed by default
React shell (src/app/, src/ui/)
SimulationContext (separate file for Vite fast refresh) and SimulationProvider build the engine once, register all four systems
useSimulation, useSimulationTime, useSimulationRunning, useEntityListVersion hooks (all useSyncExternalStore-based; subscribe at the leaf, not at the root)
ControlPanel (Start, Pause, Step, Reset, Load Scenario), SimulationTimeDisplay, MetricsPanel, EntityListPanel
Dark UI in src/app/app.css
Sample scenario
public/scenarios/simple-scenario.json — one vehicle with v=0.5 m/s, w=0.2 rad/s, three static obstacles, one dynamic actor crossing.

Tests (vitest)
src/math/geometry/operations2D.test.ts — vector ops (12 tests)
src/simulation/core/SimulationClock.test.ts — clock (7 tests)
src/simulation/entities/VehicleEntity.test.ts — kinematic update incl. semi-implicit step verification (6 tests)
src/simulation/scenarios/ScenarioLoader.test.ts — parse + buildEntity + loadFromUrl with injected fetch (12 tests)
