import { createContext, useContext, useRef, useCallback, useSyncExternalStore } from 'react'

interface SimTickStore {
  getTick: () => number
  increment: () => void
  subscribe: (cb: () => void) => () => void
}

function createSimTickStore(): SimTickStore {
  let tick = 0
  const listeners = new Set<() => void>()

  return {
    getTick: () => tick,
    increment: () => {
      tick++
      listeners.forEach(cb => cb())
    },
    subscribe: (cb: () => void) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}

const SimTickContext = createContext<SimTickStore | null>(null)

export function SimTickProvider({ children }: { children: React.ReactNode }) {
  const store = useRef(createSimTickStore()).current
  return <SimTickContext.Provider value={store}>{children}</SimTickContext.Provider>
}

export function useSimTick(): number {
  const store = useContext(SimTickContext)
  if (!store) throw new Error('useSimTick must be used within a SimTickProvider')
  return useSyncExternalStore(store.subscribe, store.getTick)
}

export function useSimTickIncrement(): () => void {
  const store = useContext(SimTickContext)
  if (!store) throw new Error('useSimTickIncrement must be used within a SimTickProvider')
  return useCallback(() => store.increment(), [store])
}

/**
 * Returns a tick that increments by 1 every `frequency` sim ticks.
 * useChartTick(10) → tick 0 for simTicks 0–9, tick 1 for 10–19, etc.
 */
export function useChartTick(frequency: number): number {
  const store = useContext(SimTickContext)
  if (!store) throw new Error('useChartTick must be used within a SimTickProvider')

  const getSnapshot = useCallback(
    () => Math.floor(store.getTick() / frequency),
    [store, frequency],
  )

  const subscribe = useCallback(
    (cb: () => void) => {
      let lastEmitted = getSnapshot()
      return store.subscribe(() => {
        const current = getSnapshot()
        if (current !== lastEmitted) {
          lastEmitted = current
          cb()
        }
      })
    },
    [store, getSnapshot],
  )

  return useSyncExternalStore(subscribe, getSnapshot)
}
