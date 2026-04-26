import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import type { CameraController } from './CameraController'
import type { CameraMode } from './CameraMode'
import { OrbitCameraController } from './OrbitCameraController'
import { FollowVehicleCameraController } from './FollowVehicleCameraController'
import { TopDownCameraController } from './TopDownCameraController'

/**
 * Owns one controller per `CameraMode` and routes calls to the
 * currently active one. Controllers themselves are stateless w.r.t.
 * mode — switching mode is `detach()` on the old, `attach()` on the
 * new, with no recreation. Tearing down (and re-`attach`-ing on
 * switch) avoids leaving stale event listeners around when we
 * eventually wire OrbitControls.
 */
export class CameraControllerManager {
  private readonly context: ThreeSceneContext
  private readonly controllers: Record<CameraMode, CameraController>
  private mode: CameraMode
  private active: CameraController

  constructor(context: ThreeSceneContext, initialMode: CameraMode = 'topDown') {
    this.context = context
    this.controllers = {
      topDown: new TopDownCameraController(),
      orbit: new OrbitCameraController(),
      followVehicle: new FollowVehicleCameraController(),
    }
    this.mode = initialMode
    this.active = this.controllers[initialMode]
    this.active.attach(this.context)
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return
    this.active.detach(this.context)
    this.mode = mode
    this.active = this.controllers[mode]
    this.active.attach(this.context)
  }

  getMode(): CameraMode {
    return this.mode
  }

  /**
   * Detach + re-attach the currently active controller against the
   * (possibly mutated) `ThreeSceneContext`. Call this after the
   * renderer swaps `context.camera` (e.g. perspective ↔ orthographic)
   * so OrbitControls / lookAt / `up`-vector setup all rebind to the
   * new camera object.
   */
  reattachActive(): void {
    this.active.detach(this.context)
    this.active.attach(this.context)
  }

  update(state: SimulationState): void {
    this.active.update(state, this.context)
  }

  dispose(): void {
    this.active.detach(this.context)
    for (const controller of Object.values(this.controllers)) {
      controller.dispose?.()
    }
  }
}
