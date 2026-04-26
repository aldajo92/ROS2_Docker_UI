import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import type { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { simPoint2DToThree } from '../mapping/simToThree'

/**
 * Chase-cam: tracks the first vehicle in `state.entities` (treated as
 * the "ego" until we have an explicit ego concept). The camera sits
 * behind and above the vehicle, looking at its current ground-plane
 * position.
 *
 * "Behind" is computed in the vehicle's frame, then mapped through
 * `simPoint2DToThree` so the camera convention is enforced in exactly
 * one place: never duplicate the sim→three mapping inside camera
 * controllers.
 */
export class FollowVehicleCameraController implements CameraController {
  private readonly distanceBehind: number
  private readonly heightAbove: number

  constructor(distanceBehind = 6, heightAbove = 4) {
    this.distanceBehind = distanceBehind
    this.heightAbove = heightAbove
  }

  attach(context: ThreeSceneContext): void {
    context.camera.up.set(0, 1, 0)
  }

  update(state: SimulationState, context: ThreeSceneContext): void {
    const vehicle = this.findEgoVehicle(state)
    if (!vehicle) return

    // Camera position in sim coordinates: behind the vehicle along its
    // heading. cos/sin of yaw give the forward unit vector.
    const yaw = vehicle.pose.yaw
    const forwardX = Math.cos(yaw)
    const forwardY = Math.sin(yaw)
    const camSimX = vehicle.pose.position.x - forwardX * this.distanceBehind
    const camSimY = vehicle.pose.position.y - forwardY * this.distanceBehind

    const camPos = simPoint2DToThree(
      vehicle.pose.position.with({ x: camSimX, y: camSimY }),
      this.heightAbove,
    )
    const target = simPoint2DToThree(vehicle.pose.position, 0)

    context.camera.position.copy(camPos)
    context.camera.lookAt(target)
  }

  detach(_context: ThreeSceneContext): void {
    // Nothing per-mode to tear down.
  }

  private findEgoVehicle(state: SimulationState): VehicleEntity | undefined {
    for (const entity of state.entities.all()) {
      if (entity.type === 'vehicle') return entity as VehicleEntity
    }
    return undefined
  }
}
