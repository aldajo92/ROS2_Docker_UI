import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { SimulationEngine } from '../simulation/core/SimulationEngine'
import { SimulationController } from '../simulation/core/SimulationController'
import { VehicleDynamicsSystem } from '../simulation/systems/VehicleDynamicsSystem'
import { CollisionSystem } from '../simulation/systems/CollisionSystem'
import { SimpleCircleCollisionBackend2D } from '../simulation/collision/SimpleCircleCollisionBackend2D'
import { MetricsSystem } from '../simulation/systems/MetricsSystem'
import { ScenarioSystem } from '../simulation/systems/ScenarioSystem'
import { VehicleCommandQueue } from '../simulation/commands/VehicleCommandQueue'
import { VehicleCommandSystem } from '../simulation/commands/VehicleCommandSystem'
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
export function SimulationProvider({ children }: { children: ReactNode }) {
  const [value] = useState<SimulationContextValue>(() => buildContext())

  useEffect(() => {
    return () => {
      value.engine.pause()
    }
  }, [value])

  return (
    <SimulationContext.Provider value={value}>{children}</SimulationContext.Provider>
  )
}

function buildContext(): SimulationContextValue {
  const engine = new SimulationEngine()
  const commandQueue = new VehicleCommandQueue()

  // Registration order is the tick order. Keep it explicit:
  //   1. ScenarioSystem        — may emit commands or spawn entities
  //   2. VehicleCommandSystem  — drains the queue onto vehicles
  //   3. VehicleDynamicsSystem — integrates pose using the new commands
  //   4. CollisionSystem       — checks collisions on the integrated state
  //   5. MetricsSystem         — last so it observes the final state
  // Default to the simple O(n²) circle backend; Rapier can be wired
  // in via an explicit async setup path (see `RapierCollisionBackend2D`).
  engine.systems.add(new ScenarioSystem())
  engine.systems.add(new VehicleCommandSystem(commandQueue))
  engine.systems.add(new VehicleDynamicsSystem())
  engine.systems.add(new CollisionSystem(new SimpleCircleCollisionBackend2D()))
  engine.systems.add(new MetricsSystem())

  const controller = new SimulationController(engine)
  return { controller, engine, commandQueue }
}
