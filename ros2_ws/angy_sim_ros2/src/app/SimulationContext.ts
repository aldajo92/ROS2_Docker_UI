import { createContext } from 'react'
import type { SimulationEngine } from '../simulation/core/SimulationEngine'
import type { SimulationController } from '../simulation/core/SimulationController'
import type { VehicleCommandQueue } from '../simulation/commands/VehicleCommandQueue'
import type { ExternalPathUpdateQueue } from '../simulation/paths/ExternalPathUpdateQueue'

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
  /**
   * Shared mailbox for path mutations sourced from external
   * transports (rosbridge / WebSocket / DDS). Producers enqueue
   * upserts/removes here at any time; `ExternalPathRenderSystem`
   * drains it during the tick and applies the changes to
   * `state.paths`. Exposed on the context so the
   * `CommunicationProvider` can hand it to its rosbridge capability
   * without recreating the system or the engine.
   */
  externalPathQueue: ExternalPathUpdateQueue
}

/**
 * Lives in its own file so `SimulationProvider.tsx` can be a
 * components-only module — required by Vite's react-refresh plugin.
 */
export const SimulationContext = createContext<SimulationContextValue | null>(null)
