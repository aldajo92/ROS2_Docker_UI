import type { SimulationSystem } from '../systems/SimulationSystem'
import type { SimulationState } from '../core/SimulationState'
import type { PeriodicPublisher } from './PeriodicPublisher'

/**
 * A `SimulationSystem` whose only job is to drive a set of
 * `PeriodicPublisher`s with the engine's `dt`. Adding it to the
 * engine's `SystemManager` is what makes outgoing telemetry "tick"
 * with the simulation rather than wall-clock.
 *
 * Note: `reset()` is a manual API, not part of `SimulationSystem`.
 * Call it from your scenario / engine reset wiring (e.g. on the
 * `'reset'` engine event) so accumulators don't leak across runs.
 */
export class CommunicationSystem implements SimulationSystem {
  public readonly name = 'CommunicationSystem'
  private readonly publishers: PeriodicPublisher[]

  constructor(publishers: PeriodicPublisher[]) {
    this.publishers = [...publishers]
  }

  addPublisher(publisher: PeriodicPublisher): void {
    this.publishers.push(publisher)
  }

  removePublisher(publisher: PeriodicPublisher): void {
    const i = this.publishers.indexOf(publisher)
    if (i !== -1) this.publishers.splice(i, 1)
  }

  update(dt: number, _state: SimulationState): void {
    for (const publisher of this.publishers) {
      publisher.update(dt)
    }
  }

  reset(): void {
    for (const publisher of this.publishers) {
      publisher.reset()
    }
  }
}
