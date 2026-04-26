import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Pure top-down "minimap" camera. Sits directly above the world
 * origin, looks straight down, and never moves. Cheap to render and
 * easy to read while tuning the simulator.
 */
export class TopDownCameraController implements CameraController {
  private readonly height: number

  constructor(height = 18) {
    this.height = height
  }

  attach(context: ThreeSceneContext): void {
    const { camera } = context
    camera.position.set(0, this.height, 0)
    // Look at the world origin. We pick a tiny non-zero `up` along
    // three +Z so screen-up corresponds to sim +Y (forward).
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
  }

  update(_state: SimulationState, _context: ThreeSceneContext): void {
    // No tracking — the camera is static in this mode.
  }

  detach(context: ThreeSceneContext): void {
    // Restore the conventional up vector for the next controller.
    context.camera.up.set(0, 1, 0)
  }
}
