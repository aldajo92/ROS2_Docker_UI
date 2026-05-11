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
 * which makes the physics model swappable (kinematic today, Rapier or remote
 * later) without touching this system or any entity code.
 *
 * When the runtime's `step()` returns a Promise (e.g. remote backend), this
 * system returns a Promise that resolves only after the write-back completes,
 * preserving the downstream tick order invariant: CollisionSystem, MetricsSystem,
 * and SimulationRecorderSystem all run after entity poses are settled.
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

  dispose(): void {
    this.runtime.dispose?.()
  }

  update(dt: number, state: SimulationState): void | Promise<void> {
    const vehicles: VehicleEntity[] = []
    for (const e of state.entities.all()) {
      if (e instanceof VehicleEntity) vehicles.push(e)
    }

    this.runtime.syncVehicles(vehicles)
    const stepResult = this.runtime.step(dt)

    const writeBack = (): void => {
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

      for (const e of state.entities.all()) {
        if (e instanceof DynamicActorEntity) e.update(dt, state)
      }
    }

    if (stepResult instanceof Promise) {
      return stepResult.then(writeBack)
    }

    writeBack()
  }
}
