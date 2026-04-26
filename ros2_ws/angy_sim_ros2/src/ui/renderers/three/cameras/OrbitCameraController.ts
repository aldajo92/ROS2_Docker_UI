import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import {
  attachOrbitControls,
  type OrbitControlsHandle,
} from './attachOrbitControls'

/**
 * Interactive 3/4 view: drag to rotate, right-drag to pan, wheel to
 * zoom. The actual `OrbitControls` wiring lives in `attachOrbitControls`
 * so this class is just a small policy: where to put the camera
 * initially, and which interaction flags to enable.
 */
export class OrbitCameraController implements CameraController {
  private readonly initialDistance: number
  private readonly initialHeight: number
  private handle?: OrbitControlsHandle

  constructor(distance = 12, height = 12) {
    this.initialDistance = distance
    this.initialHeight = height
  }

  attach(context: ThreeSceneContext): void {
    const { camera } = context

    camera.up.set(0, 1, 0)
    camera.position.set(this.initialDistance, this.initialHeight, this.initialDistance)
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
