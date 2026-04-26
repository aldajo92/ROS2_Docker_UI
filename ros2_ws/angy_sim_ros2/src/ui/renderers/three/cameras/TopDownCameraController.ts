import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import {
  attachOrbitControls,
  type OrbitControlsHandle,
} from './attachOrbitControls'
import {
  getThreeCameraUpForSimulationZUp,
  getThreeCameraUpForTopDown,
  getThreePositionForTopDownCamera,
} from '../mapping/simToThree'

/**
 * Top-down "minimap" view with **drag-pan and zoom only** — no
 * rotation. The camera looks straight down the simulation Z axis at
 * the X/Y plane. The orientation is pinned via a Gazebo-style
 * choice of `up`:
 *
 *   - `position` is sim `(0, 0, height)` mapped to three space.
 *   - `up` is the three-space image of sim `+Y`, so screen-up
 *     corresponds to sim "forward" and **+X appears to the right of
 *     the screen**, **+Y appears upward on the screen**.
 *
 * Both values are pulled from the mapping module — no raw axis
 * literals here. If the sim→three mapping ever changes, this file
 * needs no edits.
 *
 * `screenSpacePanning: true` is required: when the camera looks
 * straight down, OrbitControls' default panning derives the pan-up
 * axis from `cross(camera.up, camera.right)`. With our `up` pointing
 * sideways in three space, the default would conflate pan with
 * dolly. Screen-space panning aligns the pan axes to the camera's
 * own X/Y, which is what the user intuits from a "drag the map"
 * gesture.
 */
export class TopDownCameraController implements CameraController {
  private readonly height: number
  private handle?: OrbitControlsHandle

  constructor(height = 18) {
    this.height = height
  }

  attach(context: ThreeSceneContext): void {
    const { camera } = context
    camera.up.copy(getThreeCameraUpForTopDown())
    camera.position.copy(getThreePositionForTopDownCamera(this.height))
    camera.lookAt(0, 0, 0)

    this.handle = attachOrbitControls(context, {
      enableRotate: false,
      enableZoom: true,
      enablePan: true,
      screenSpacePanning: true,
    })
  }

  update(_state: SimulationState, _context: ThreeSceneContext): void {
    // No-op. The camera is parked by the user via OrbitControls; we
    // don't move it from sim state in this mode.
  }

  detach(context: ThreeSceneContext): void {
    this.handle?.dispose()
    this.handle = undefined
    // Restore the conventional up vector (sim +Z = three +Y) so the
    // next controller (orbit / follow) starts from a stable
    // orientation. Pulling from the mapping helper keeps this in
    // lockstep with whatever convention `simToThree` declares.
    context.camera.up.copy(getThreeCameraUpForSimulationZUp())
  }

  dispose(): void {
    this.handle?.dispose()
    this.handle = undefined
  }
}
