import type { SimulationState } from '../core/SimulationState'
import type { SimulationSystem } from './SimulationSystem'
import { VehicleEntity } from '../entities/VehicleEntity'
import { DynamicActorEntity } from '../entities/DynamicActorEntity'
import { Pose2D } from '../../math/geometry/Pose2D'
import { Point2D } from '../../math/geometry/Point2D'
import type { VehicleMotionRuntime } from '../physics/VehicleMotionRuntime'
import { KinematicVehicleMotionRuntime } from '../physics/KinematicVehicleMotionRuntime'

/**
 * Orchestrates vehicle and dynamic-actor motion for one tick.
 *
 * Vehicle motion is fully delegated to the injected `VehicleMotionRuntime`,
 * which makes the physics model swappable (kinematic today, Rapier later)
 * without touching this system or any entity code.
 *
 * Dynamic actors remain on their own `update()` path for now.
 */
export class VehicleDynamicsSystem implements SimulationSystem {
  readonly name = 'vehicle_dynamics'

  constructor(
    private readonly runtime: VehicleMotionRuntime = new KinematicVehicleMotionRuntime(),
  ) {}

  reset(): void {
    this.runtime.reset()
  }

  update(dt: number, state: SimulationState): void {
    // Collect vehicles and delegate motion to the runtime
    const vehicles: VehicleEntity[] = []
    for (const e of state.entities.all()) {
      if (e instanceof VehicleEntity) vehicles.push(e)
    }

    this.runtime.syncVehicles(vehicles)
    this.runtime.step(dt)

    // Write runtime results back into entities and accumulate metrics
    let peakSpeed = state.metrics.peakSpeed
    let totalDistance = state.metrics.totalDistance

    for (const vehicle of vehicles) {
      const next = this.runtime.readVehicleState(vehicle.id)
      if (!next) continue
      const before = vehicle.distanceTraveled
      vehicle.pose = new Pose2D(new Point2D(next.pose.x, next.pose.y), next.pose.yaw)
      vehicle.distanceTraveled = next.distanceTraveled
      vehicle.v = next.velocity.linear
      vehicle.w = next.velocity.angular
      const speed = Math.abs(next.velocity.linear)
      if (speed > peakSpeed) peakSpeed = speed
      totalDistance += next.distanceTraveled - before
    }

    state.metrics.peakSpeed = peakSpeed
    state.metrics.totalDistance = totalDistance

    // Dynamic actors stay on their direct update path
    for (const e of state.entities.all()) {
      if (e instanceof DynamicActorEntity) e.update(dt, state)
    }
  }
}
