import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { SimulationEngine } from '../simulation/core/SimulationEngine'
import { SimulationController } from '../simulation/core/SimulationController'
import { VehicleDynamicsSystem } from '../simulation/systems/VehicleDynamicsSystem'
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
import { LidarSensorSystem } from '../simulation/systems/LidarSensorSystem'
import { SimulationContext } from './SimulationContext'
import type { SimulationContextValue } from './SimulationContext'

/**
 * Builds a SimulationEngine on first mount, wires the default systems,
 * and exposes both the engine and a controller facade through context.
 *
 * The engine is created once and never recreated — React StrictMode's
 * double-invoke triggers cleanup, but the engine itself stays alive
 * between strict-mode passes. We only `pause()` on unmount; we never
 * recreate. This avoids the "two engines running" trap.
 */
export interface SimulationProviderProps {
  children: ReactNode
  /**
   * Collision backend selector. Defaults to
   * `DEFAULT_COLLISION_CONFIG` (`simpleCircle2D`). Pass
   * `{ backend: 'disabled' }` to skip collision detection without
   * removing `CollisionSystem` from the tick pipeline.
   *
   * `'rapier2D'` is intentionally NOT supported synchronously here
   * because it requires `await RapierCollisionBackend2D.create()`.
   * Wire Rapier explicitly at the call site if you need it.
   */
  collisionConfig?: CollisionConfig
}

export function SimulationProvider({
  children,
  collisionConfig = DEFAULT_COLLISION_CONFIG,
}: SimulationProviderProps) {
  const [value] = useState<SimulationContextValue>(() =>
    buildContext(collisionConfig),
  )

  useEffect(() => {
    return () => {
      value.engine.pause()
    }
  }, [value])

  return (
    <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>
  )
}

function buildContext(collisionConfig: CollisionConfig): SimulationContextValue {
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
  //   7. LidarSensorSystem            — generates scans from current entity poses
  //   8. CollisionSystem              — checks collisions
  //   9. MetricsSystem                — observes final state
  //  10. SimulationRecorderSystem     — snapshots the final post-tick state
  engine.systems.add(new ScenarioSystem())
  engine.systems.add(new VehicleCommandSystem(commandQueue))
  engine.systems.add(new ExternalPathRenderSystem(externalPathQueue))
  engine.systems.add(new ExternalPoseArrayRenderSystem(externalPoseArrayQueue))
  engine.systems.add(new VehicleDynamicsSystem())
  engine.systems.add(new TrajectoryTrackingSystem())
  engine.systems.add(new LidarSensorSystem())
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
