import { createContext } from 'react'
import type { SimulationEngine } from '../simulation/core/SimulationEngine'
import type { SimulationController } from '../simulation/core/SimulationController'

export interface SimulationContextValue {
  controller: SimulationController
  engine: SimulationEngine
}

/**
 * Lives in its own file so `SimulationProvider.tsx` can be a
 * components-only module — required by Vite's react-refresh plugin.
 */
export const SimulationContext = createContext<SimulationContextValue | null>(null)
