import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import {
  attachOrbitControls,
  type OrbitControlsHandle,
} from './attachOrbitControls'
import {
  getThreeCameraUpForSimulationZUp,
  getThreePositionForGazeboLikeCamera,
} from '../mapping/simToThree'

/**
 * Interactive 3/4 view: drag to rotate, right-drag to pan, wheel to
 * zoom. The default placement matches Gazebo Classic's `pose 5 -5 5`
 * convention — camera ahead-and-right-and-above the origin, looking
 * back at it — which gives an immediately readable view of all three
 * axes plus the ground plane.
 *
 * Position / up are pulled from the sim→three mapping module so the
 * Gazebo-likeness is encoded in one place rather than being a magic
 * triple of three-space numbers here.
 */
export class OrbitCameraController implements CameraController {
  private readonly initialDistance: number
  private handle?: OrbitControlsHandle

  /**
   * @param initialDistance Sim-frame radius of the default camera
   *                        triple `(+d, -d, +d)` (Gazebo convention).
   *                        Larger = more zoomed-out scene.
   */
  constructor(initialDistance = 8) {
    this.initialDistance = initialDistance
  }

  attach(context: ThreeSceneContext): void {
    const { camera } = context

    camera.up.copy(getThreeCameraUpForSimulationZUp())
    camera.position.copy(getThreePositionForGazeboLikeCamera(this.initialDistance))
    camera.lookAt(0, 0, 0)

    this.handle = attachOrbitControls(context, {
      enableRotate: true,
      enableZoom: true,
      enablePan: true,
    })
  }

  update(_state: SimulationState, _context: ThreeSceneContext): void {
    // No-op without damping: the camera is already where the user
    // last placed it. Calling `controls.update()` here is free but
    // unnecessary, and skipping it keeps the per-tick path zero-work.
  }

  detach(_context: ThreeSceneContext): void {
    this.handle?.dispose()
    this.handle = undefined
  }

  dispose(): void {
    this.handle?.dispose()
    this.handle = undefined
  }
}
