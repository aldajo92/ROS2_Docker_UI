import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'
import { VehicleEntity } from '../entities/VehicleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'

/**
 * Iterates every motion-bearing entity and advances it one step.
 * Per-entity update logic lives on the entity itself; this system is
 * the orchestrator and is also where speed/distance metrics are
 * accumulated (they're cheap to compute at the same time we're
 * already touching the entity).
 */
export class VehicleDynamicsSystem implements SimulationSystem {
  readonly name = 'vehicle_dynamics'

  update(dt: number, state: SimulationState): void {
    let peakSpeed = state.metrics.peakSpeed
    let totalDistance = state.metrics.totalDistance

    for (const e of state.entities.all()) {
      if (e instanceof VehicleEntity) {
        const before = e.distanceTraveled
        e.update(dt, state)
        const speed = Math.abs(e.v)
        if (speed > peakSpeed) peakSpeed = speed
        totalDistance += e.distanceTraveled - before
      } else if (e instanceof DynamicActorEntity) {
        e.update(dt, state)
      }
    }

    state.metrics.peakSpeed = peakSpeed
    state.metrics.totalDistance = totalDistance
  }
}
