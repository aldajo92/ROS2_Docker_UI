import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import {
  attachOrbitControls,
  type OrbitControlsHandle,
} from './attachOrbitControls'

/**
 * Top-down "minimap" view with **drag-pan and zoom only** — no
 * rotation. Mirrors the behavior of `angelos_sim_ros2`'s follow-mode
 * camera (`enableRotate={camMode === 'orbit'}`): the user can scroll
 * around the world and zoom in / out, but the camera always looks
 * straight down so the +Y axis (sim "forward") is always screen-up.
 *
 * Camera setup:
 *   - Position is `(0, height, 0)` in THREE-space — straight above
 *     the world origin.
 *   - `up = (0, 0, -1)` (THREE) so screen-up corresponds to sim +Y.
 *     With this `up`, `OrbitControls`'s pan moves the target across
 *     the world XZ plane, which is exactly the simulation ground.
 *   - `lookAt(0, 0, 0)` for the initial view; `OrbitControls` then
 *     owns subsequent target / position updates.
 *
 * Interaction is delegated to the shared `attachOrbitControls` helper
 * with `enableRotate: false` (the diff vs orbit) and
 * `screenSpacePanning: true` (the diff vs the helper default).
 *
 * Why `screenSpacePanning: true` here specifically: when the camera
 * looks straight down, OrbitControls' default `screenSpacePanning =
 * false` derives its pan-up axis as `cross(camera.up, camera.right)`,
 * which for our `up = (0, 0, -1)` collapses to **world Y** — i.e.
 * straight up/down. Dragging vertically would then move the camera
 * toward / away from the ground and look exactly like a zoom on top
 * of the actual pan. Switching to screen-space panning makes the
 * pan-up axis equal to the camera's local up (= world `-Z` here, =
 * sim `+Y`), so dragging up on screen scrolls the map "north" with
 * no vertical motion. Orbit mode keeps the default because there
 * `false` correctly produces a ground-parallel pan regardless of
 * camera pitch.
 */
export class TopDownCameraController implements CameraController {
  private readonly height: number
  private handle?: OrbitControlsHandle

  constructor(height = 18) {
    this.height = height
  }

  attach(context: ThreeSceneContext): void {
    const { camera } = context
    camera.up.set(0, 0, -1)
    camera.position.set(0, this.height, 0)
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
    // Restore the conventional up vector so the next controller
    // (orbit / follow) starts from a clean orientation.
    context.camera.up.set(0, 1, 0)
  }

  dispose(): void {
    this.handle?.dispose()
    this.handle = undefined
  }
}
