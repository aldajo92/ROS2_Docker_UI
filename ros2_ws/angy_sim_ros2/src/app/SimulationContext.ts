import { createContext } from 'react'
import type { SimulationEngine } from '../simulation/core/SimulationEngine'
import type { SimulationController } from '../simulation/core/SimulationController'
import type { VehicleCommandQueue } from '../simulation/commands/VehicleCommandQueue'

export interface SimulationContextValue {
  controller: SimulationController
  engine: SimulationEngine
  /**
   * Shared queue for addressed `VehicleCommand`s. Any UI / transport
   * producer (keyboard hook, WebSocket bridge, scenario tooling)
   * pushes here; `VehicleCommandSystem` drains it during the tick.
   *
   * Exposing it on the context keeps producers framework-agnostic —
   * the keyboard hook doesn't take it as a prop, it just reads it.
   */
  commandQueue: VehicleCommandQueue
}

/**
 * Lives in its own file so `SimulationProvider.tsx` can be a
 * components-only module — required by Vite's react-refresh plugin.
 */
export const SimulationContext = createContext<SimulationContextValue | null>(null)
