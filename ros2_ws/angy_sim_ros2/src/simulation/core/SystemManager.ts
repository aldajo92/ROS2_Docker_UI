import type { SimulationState } from './SimulationState'
import type { SimulationSystem } from '../systems/SimulationSystem'

/**
 * Holds an ordered list of systems and runs them sequentially each
 * tick. Order matters — e.g. dynamics should run before collision.
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

  update(dt: number, state: SimulationState): void {
    for (const sys of this.systems) sys.update(dt, state)
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
