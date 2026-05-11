import type { SimulationState } from './SimulationState'
import type { SimulationSystem } from '../systems/SimulationSystem'

/**
 * Optional per-system instrumentation hook used by the profiler. Kept
 * as a minimal structural interface so `SystemManager` remains free
 * of profiler/framework types. The manager calls `beforeSystem(name)`
 * immediately before each `sys.update` and `afterSystem(name)`
 * immediately after, preserving the existing iteration order.
 */
export interface SystemManagerInstrument {
  beforeSystem(name: string): void
  afterSystem(name: string): void
}

/**
 * Holds an ordered list of systems and runs them sequentially each
 * tick. Order matters — e.g. dynamics should run before collision.
 *
 * When every system's `update()` returns `void` (the common case for
 * kinematic/rapier), the entire tick completes synchronously with zero
 * extra overhead — the return value is `undefined`.
 *
 * When a system returns a `Promise<void>` (e.g. `VehicleDynamicsSystem`
 * backed by a remote runtime), subsequent systems are chained via
 * `.then()` so they run only after the async work settles. The manager
 * returns the tail Promise to the caller.
 */
export class SystemManager {
  private systems: SimulationSystem[] = []

  add(system: SimulationSystem): void {
    if (this.systems.some((s) => s.name === system.name)) {
      throw new Error(`SystemManager: system "${system.name}" already registered`)
    }
    this.systems.push(system)
  }

  remove(name: string): boolean {
    const i = this.systems.findIndex((s) => s.name === name)
    if (i < 0) return false
    this.systems.splice(i, 1)
    return true
  }

  get(name: string): SimulationSystem | undefined {
    return this.systems.find((s) => s.name === name)
  }

  /**
   * Runs every registered system in registration order.
   *
   * Returns `undefined` (void) when the entire run is synchronous,
   * or a `Promise<void>` that resolves when all async work completes.
   *
   * Instrumentation via `beforeSystem`/`afterSystem` wraps the
   * synchronous entry point of each system regardless of async depth.
   * The no-instrument synchronous path is zero-overhead.
   */
  update(
    dt: number,
    state: SimulationState,
    instrument?: SystemManagerInstrument,
  ): void | Promise<void> {
    let chain: Promise<void> | null = null

    for (const sys of this.systems) {
      if (chain !== null) {
        const s = sys
        chain = chain.then(() => {
          instrument?.beforeSystem(s.name)
          let result: void | Promise<void>
          try {
            result = s.update(dt, state)
          } finally {
            instrument?.afterSystem(s.name)
          }
          return result instanceof Promise ? result : undefined
        })
      } else {
        instrument?.beforeSystem(sys.name)
        let result: void | Promise<void>
        try {
          result = sys.update(dt, state)
        } finally {
          instrument?.afterSystem(sys.name)
        }
        if (result instanceof Promise) {
          chain = result
        }
      }
    }

    return chain ?? undefined
  }

  /** Invoke `reset` on every system that defines it. Order follows
   *  registration order. Errors propagate to the caller. */
  reset(): void {
    for (const sys of this.systems) sys.reset?.()
  }

  /** Invoke `dispose` on every system that defines it, in reverse
   *  registration order so dependencies tear down before their
   *  prerequisites. Errors propagate. */
  dispose(): void {
    for (let i = this.systems.length - 1; i >= 0; i--) {
      this.systems[i].dispose?.()
    }
  }

  list(): readonly SimulationSystem[] {
    return this.systems
  }

  clear(): void {
    this.systems.length = 0
  }
}
