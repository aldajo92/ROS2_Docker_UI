import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Static "orbit-style" camera. Sits at a fixed elevated angle and
 * looks at the origin — gives a nice 3/4 view of the scene without
 * pulling in `OrbitControls` (and the `examples/jsm` dependency that
 * comes with it).
 *
 * Wiring real interactive orbit (drag / wheel zoom) is left for a
 * follow-up: replace the body of `attach` with `new OrbitControls(...)`
 * and route its `dispose()` through this class. None of the other
 * renderers need to change.
 */
export class OrbitCameraController implements CameraController {
  private readonly distance: number
  private readonly height: number

  constructor(distance = 12, height = 12) {
    this.distance = distance
    this.height = height
  }

  attach(context: ThreeSceneContext): void {
    const { camera } = context
    camera.position.set(this.distance, this.height, this.distance)
    camera.up.set(0, 1, 0)
    camera.lookAt(0, 0, 0)
  }

  update(_state: SimulationState, _context: ThreeSceneContext): void {
    // Static for now. Replace with input-driven orbit when needed.
  }

  detach(_context: ThreeSceneContext): void {
    // Nothing to clean up while we're a static-orbit stand-in.
  }
}
