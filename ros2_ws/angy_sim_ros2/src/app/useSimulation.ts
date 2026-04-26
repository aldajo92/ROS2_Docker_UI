import { useContext, useSyncExternalStore } from 'react'
import { SimulationContext } from './SimulationContext'
import type { SimulationContextValue } from './SimulationContext'

export function useSimulation(): SimulationContextValue {
  const ctx = useContext(SimulationContext)
  if (!ctx) throw new Error('useSimulation must be used within <SimulationProvider>')
  return ctx
}

/**
 * Re-render the calling component on every sim tick. Returns the
 * current sim time. Subscribe at the smallest leaf component that
 * actually needs to react to ticks — putting this in a top-level
 * component will cascade renders into the whole tree.
 */
export function useSimulationTime(): number {
  const { engine } = useSimulation()
  return useSyncExternalStore(
    (cb) => engine.events.on('tick', cb),
    () => engine.clock.time(),
    () => 0,
  )
}

/**
 * Re-render only when the running flag changes (start/pause/reset).
 * Cheaper than `useSimulationTime` when all you need is the button
 * state.
 */
export function useSimulationRunning(): boolean {
  const { engine } = useSimulation()
  return useSyncExternalStore(
    (cb) => {
      const offStart = engine.events.on('started', cb)
      const offPause = engine.events.on('paused', cb)
      const offReset = engine.events.on('reset', cb)
      return () => {
        offStart()
        offPause()
        offReset()
      }
    },
    () => engine.isRunning(),
    () => false,
  )
}

/**
 * Returns the current entity-list "version" — increments whenever
 * entities are added/removed or a scenario is loaded. Use as a
 * dependency or as a re-render trigger for entity-listing components.
 */
export function useEntityListVersion(): number {
  const { engine } = useSimulation()
  return useSyncExternalStore(
    (cb) => {
      const off1 = engine.events.on('entityAdded', cb)
      const off2 = engine.events.on('entityRemoved', cb)
      const off3 = engine.events.on('reset', cb)
      const off4 = engine.events.on('scenarioLoaded', cb)
      return () => {
        off1()
        off2()
        off3()
        off4()
      }
    },
    () => engine.entities.size(),
    () => 0,
  )
}
