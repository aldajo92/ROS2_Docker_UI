import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { SimulationEngine } from '../simulation/core/SimulationEngine'
import { SimulationController } from '../simulation/core/SimulationController'
import { VehicleDynamicsSystem } from '../simulation/systems/VehicleDynamicsSystem'
import { CollisionSystem } from '../simulation/systems/CollisionSystem'
import { MetricsSystem } from '../simulation/systems/MetricsSystem'
import { ScenarioSystem } from '../simulation/systems/ScenarioSystem'
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
  engine.systems.add(new VehicleDynamicsSystem())
  engine.systems.add(new CollisionSystem())
  engine.systems.add(new MetricsSystem())
  engine.systems.add(new ScenarioSystem())
  const controller = new SimulationController(engine)
  return { controller, engine }
}
