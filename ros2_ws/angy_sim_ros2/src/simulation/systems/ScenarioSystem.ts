import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'

export interface ScenarioEvent {
  /** Simulation time at which the event fires, in seconds. */
  time: number
  /** What to do when the event fires. Mutates state directly. */
  apply(state: SimulationState): void
}

/**
 * Fires scheduled scenario events when sim time crosses each event's
 * trigger time. Pending events are kept in ascending-time order so
 * each tick only inspects the head of the list.
 *
 * The scenario JSON format does not yet include a generic event
 * encoding — that's a future addition. For now scenarios that need
 * timed behavior should push events imperatively via `setEvents`.
 */
export class ScenarioSystem implements SimulationSystem {
  readonly name = 'scenario'

  private pending: ScenarioEvent[] = []

  setEvents(events: ScenarioEvent[]): void {
    this.pending = [...events].sort((a, b) => a.time - b.time)
  }

  clear(): void {
    this.pending = []
  }

  update(_dt: number, state: SimulationState): void {
    const now = state.clock.time()
    while (this.pending.length > 0 && this.pending[0].time <= now) {
      const evt = this.pending.shift()
      if (evt) evt.apply(state)
    }
  }
}
