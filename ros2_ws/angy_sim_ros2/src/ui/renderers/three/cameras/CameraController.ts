import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Per-mode camera behavior. Implementations may read `SimulationState`
 * but must not mutate it. They are allowed to mutate the camera in
 * the provided `ThreeSceneContext` (position, lookAt, projection).
 *
 *   - `attach(context)`: called when this controller becomes active.
 *     Place the camera at a sensible default for this mode.
 *   - `update(state, context)`: called every render. Cheap-by-default;
 *     no-op if the camera doesn't track a moving target.
 *   - `detach(context)`: called when switching modes. Restore any
 *     listeners / DOM bindings added in `attach`.
 *   - `dispose()`: optional, called when the renderer tears down.
 */
export interface CameraController {
  attach(context: ThreeSceneContext): void
  update(state: SimulationState, context: ThreeSceneContext): void
  detach(context: ThreeSceneContext): void
  dispose?(): void
}
