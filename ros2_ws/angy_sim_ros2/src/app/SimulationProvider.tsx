import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { SimulationEngine } from '../simulation/core/SimulationEngine'
import { SimulationController } from '../simulation/core/SimulationController'
import { VehicleDynamicsSystem } from '../simulation/systems/VehicleDynamicsSystem'
import { buildVehicleMotionRuntime } from './buildVehicleMotionRuntime'
import { buildVehicleMotionRuntimeAsync } from './buildVehicleMotionRuntimeAsync'
import { VehicleMotionRuntimeAsyncRequired } from './buildVehicleMotionRuntime'
import type { VehicleMotionRuntime } from '../simulation/physics/VehicleMotionRuntime'
import type { VehicleMotionRuntimeConfig } from '../simulation/physics/VehicleMotionRuntimeConfig'
import { DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG } from '../simulation/physics/VehicleMotionRuntimeConfig'
import { CollisionSystem } from '../simulation/systems/CollisionSystem'
import type { CollisionBackend2D } from '../simulation/collision/CollisionBackend2D'
import {
  DEFAULT_COLLISION_CONFIG,
  type CollisionConfig,
} from '../simulation/collision/CollisionConfig'
import { SimpleCircleCollisionBackend2D } from '../simulation/collision/SimpleCircleCollisionBackend2D'
import { NoopCollisionBackend2D } from '../simulation/collision/NoopCollisionBackend2D'
import { MetricsSystem } from '../simulation/systems/MetricsSystem'
import { ScenarioSystem } from '../simulation/systems/ScenarioSystem'
import { TrajectoryTrackingSystem } from '../simulation/systems/TrajectoryTrackingSystem'
import { SimulationRecorderSystem } from '../simulation/recording/SimulationRecorderSystem'
import { VehicleCommandQueue } from '../simulation/commands/VehicleCommandQueue'
import { VehicleCommandSystem } from '../simulation/commands/VehicleCommandSystem'
import { ExternalPathUpdateQueue } from '../simulation/paths/ExternalPathUpdateQueue'
import { ExternalPathRenderSystem } from '../simulation/systems/ExternalPathRenderSystem'
import { ExternalPoseArrayUpdateQueue } from '../simulation/poses/ExternalPoseArrayUpdateQueue'
import { ExternalPoseArrayRenderSystem } from '../simulation/systems/ExternalPoseArrayRenderSystem'
import { SimulationContext } from './SimulationContext'
import type { SimulationContextValue } from './SimulationContext'

/**
 * Builds a SimulationEngine on first mount, wires the default systems,
 * and exposes both the engine and a controller facade through context.
 *
 * ## Sync vs async runtime selection
 *
 * `kinematic` (the default) is synchronous — the engine is ready immediately
 * and `useState` lazy-init guarantees it is created exactly once, even in
 * React StrictMode.
 *
 * `rapier` and any future async runtime require WASM/network initialization.
 * When `vehicleMotionRuntimeConfig: { type: 'rapier' }` is passed:
 *   - the provider renders `null` until the runtime is ready
 *   - async init runs in `useEffect` so it does not block the first render
 *   - children are mounted once the context is available
 *
 * Alternatively, a pre-built runtime can be injected directly via the
 * `vehicleMotionRuntime` prop (takes priority over `vehicleMotionRuntimeConfig`).
 * This is useful for tests or call sites that need to share one runtime
 * instance across multiple providers.
 *
 * ## Cleanup
 *
 * On unmount the provider calls `engine.pause()` followed by
 * `engine.systems.dispose()`. `VehicleDynamicsSystem.dispose()` in turn
 * calls `runtime.dispose?.()`, which for `RapierVehicleMotionRuntime`
 * frees the underlying WASM world.
 */
export interface SimulationProviderProps {
  children: ReactNode
  /**
   * Collision backend selector. Defaults to `DEFAULT_COLLISION_CONFIG`
   * (`simpleCircle2D`). `'rapier2D'` requires async construction —
   * wire `RapierCollisionBackend2D` explicitly at the call site.
   */
  collisionConfig?: CollisionConfig
  /**
   * Vehicle motion runtime selector. Supports all registered types,
   * including `rapier` (async). Defaults to `{ type: 'kinematic' }`.
   * Ignored when `vehicleMotionRuntime` is provided.
   */
  vehicleMotionRuntimeConfig?: VehicleMotionRuntimeConfig
  /**
   * Pre-built runtime instance. Takes priority over
   * `vehicleMotionRuntimeConfig`. Useful when the runtime was created
   * externally (e.g. to share it, or to inject a test double).
   * The provider calls `runtime.dispose?.()` on unmount via the system
   * dispose chain.
   */
  vehicleMotionRuntime?: VehicleMotionRuntime
}

export function SimulationProvider({
  children,
  collisionConfig = DEFAULT_COLLISION_CONFIG,
  vehicleMotionRuntimeConfig = DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG,
  vehicleMotionRuntime: injectedRuntime,
}: SimulationProviderProps) {
  // Synchronous path: useState guarantees single creation even in StrictMode.
  // Returns null only when the config requires async init (e.g. rapier).
  const [syncCtx] = useState<SimulationContextValue | null>(() => {
    const runtime = injectedRuntime ?? tryBuildVehicleMotionRuntime(vehicleMotionRuntimeConfig)
    return runtime ? buildContext(collisionConfig, runtime) : null
  })

  // Async path: populated by the effect below when syncCtx is null.
  const [asyncCtx, setAsyncCtx] = useState<SimulationContextValue | null>(null)
  // Surfaces async init failures (e.g. unsupported type) through React's error boundary.
  const [asyncError, setAsyncError] = useState<Error | null>(null)

  // Async init — runs only when syncCtx is null (no sync runtime available).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (syncCtx !== null) return
    let cancelled = false
    let built: SimulationContextValue | null = null

    buildVehicleMotionRuntimeAsync(vehicleMotionRuntimeConfig)
      .then((runtime) => {
        if (cancelled) { runtime.dispose?.(); return }
        built = buildContext(collisionConfig, runtime)
        setAsyncCtx(built)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAsyncError(err instanceof Error ? err : new Error(String(err)))
        }
      })

    return () => {
      cancelled = true
      if (built) {
        built.engine.pause()
        built.engine.systems.dispose()
      }
    }
  }, []) // intentional stable deps — all inputs captured from initial render

  // Cleanup for the synchronously-built context.
  useEffect(() => {
    if (!syncCtx) return
    return () => {
      syncCtx.engine.pause()
      syncCtx.engine.systems.dispose()
    }
  }, [syncCtx])

  if (asyncError) throw asyncError

  const ctx = syncCtx ?? asyncCtx
  if (!ctx) return null

  return (
    <SimulationContext.Provider value={ctx}>{children}</SimulationContext.Provider>
  )
}

/**
 * Attempts synchronous runtime construction from config.
 * Returns `null` only for `VehicleMotionRuntimeAsyncRequired` (e.g. `rapier`),
 * letting the provider fall through to the async `useEffect` path.
 * Any other error (unsupported type, invalid config) is re-thrown immediately.
 */
function tryBuildVehicleMotionRuntime(
  config: VehicleMotionRuntimeConfig,
): VehicleMotionRuntime | null {
  try {
    return buildVehicleMotionRuntime(config)
  } catch (e) {
    if (e instanceof VehicleMotionRuntimeAsyncRequired) return null
    throw e
  }
}

function buildContext(
  collisionConfig: CollisionConfig,
  runtime: VehicleMotionRuntime,
): SimulationContextValue {
  const engine = new SimulationEngine()
  const commandQueue = new VehicleCommandQueue()
  const externalPathQueue = new ExternalPathUpdateQueue()
  const externalPoseArrayQueue = new ExternalPoseArrayUpdateQueue()

  // Registration order is the tick order. Keep it explicit:
  //   1. ScenarioSystem               — may emit commands or spawn entities
  //   2. VehicleCommandSystem         — drains the command queue onto vehicles
  //   3. ExternalPathRenderSystem     — drains externally-published paths
  //                                     into state.paths BEFORE downstream
  //                                     systems read them
  //   4. ExternalPoseArrayRenderSystem — drains pose-array updates into state.poseArrays
  //   5. VehicleDynamicsSystem        — integrates pose
  //   6. TrajectoryTrackingSystem     — appends to state.trajectories
  //   7. CollisionSystem              — checks collisions
  //   8. MetricsSystem                — observes final state
  //   9. SimulationRecorderSystem     — snapshots the final post-tick state
  engine.systems.add(new ScenarioSystem())
  engine.systems.add(new VehicleCommandSystem(commandQueue))
  engine.systems.add(new ExternalPathRenderSystem(externalPathQueue))
  engine.systems.add(new ExternalPoseArrayRenderSystem(externalPoseArrayQueue))
  engine.systems.add(new VehicleDynamicsSystem(runtime))
  engine.systems.add(new TrajectoryTrackingSystem())
  engine.systems.add(new CollisionSystem(buildCollisionBackend(collisionConfig)))
  engine.systems.add(new MetricsSystem())
  engine.systems.add(new SimulationRecorderSystem(engine.recorder))

  const controller = new SimulationController(engine)
  return { controller, engine, commandQueue, externalPathQueue, externalPoseArrayQueue }
}

function buildCollisionBackend(config: CollisionConfig): CollisionBackend2D {
  switch (config.backend) {
    case 'disabled':
      return new NoopCollisionBackend2D()
    case 'simpleCircle2D':
      return new SimpleCircleCollisionBackend2D()
    case 'rapier2D':
      // Rapier requires `await RapierCollisionBackend2D.create()` and
      // therefore cannot be wired up synchronously inside this
      // provider. Wire it explicitly at the call site if you need it.
      throw new Error(
        "SimulationProvider cannot construct 'rapier2D' synchronously. " +
          'Wire RapierCollisionBackend2D explicitly via an async setup path.',
      )
  }
}
