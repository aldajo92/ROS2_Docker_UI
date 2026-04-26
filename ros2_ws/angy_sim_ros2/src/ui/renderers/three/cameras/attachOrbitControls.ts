import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Shared `OrbitControls` setup used by every interactive camera mode
 * in this renderer. Centralizing it has two payoffs:
 *
 *   1. The "change → requestRender" bridge that lets the user pan/zoom
 *      while the engine is paused exists in exactly one place. Each
 *      controller can no longer drift out of sync with the others.
 *   2. The behavior diff between modes (orbit vs top-down vs anything
 *      future) is a single line of options — `enableRotate: false` is
 *      what makes top-down "drag + zoom only", mirroring the
 *      `enableRotate={camMode === 'orbit'}` pattern from the original
 *      `angelos_sim_ros2` reference.
 *
 * Damping is intentionally OFF: with damping on, `OrbitControls`
 * expects its `update()` to be called every frame regardless of input,
 * which conflicts with our event-driven render model. Without damping,
 * each `change` event is exactly one user input and we paint exactly
 * once per event.
 */
export interface OrbitControlsOptions {
  enableRotate?: boolean
  enableZoom?: boolean
  enablePan?: boolean
  rotateSpeed?: number
  zoomSpeed?: number
  panSpeed?: number
  minDistance?: number
  maxDistance?: number
  /** Clamps the polar angle so users can't flip below the ground in
   *  rotate-enabled modes. Ignored when `enableRotate === false`. */
  maxPolarAngle?: number
  /** When `false`, pan moves the target along the world XZ plane —
   *  the right behavior for both orbit (3/4 view) and top-down. */
  screenSpacePanning?: boolean
  /** Where the controls orbit / pan around (THREE-space). Defaults
   *  to the world origin. */
  target?: { x: number; y: number; z: number }
}

export interface OrbitControlsHandle {
  controls: OrbitControls
  /** Detach the change listener and free the controls' DOM bindings.
   *  After calling this, the handle MUST NOT be used again. */
  dispose(): void
}

export function attachOrbitControls(
  context: ThreeSceneContext,
  options: OrbitControlsOptions = {},
): OrbitControlsHandle {
  const { camera, renderer } = context
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = false
  controls.enableRotate = options.enableRotate ?? true
  controls.enableZoom = options.enableZoom ?? true
  controls.enablePan = options.enablePan ?? true
  controls.rotateSpeed = options.rotateSpeed ?? 0.9
  controls.zoomSpeed = options.zoomSpeed ?? 0.9
  controls.panSpeed = options.panSpeed ?? 0.8
  controls.minDistance = options.minDistance ?? 1
  controls.maxDistance = options.maxDistance ?? 200
  controls.maxPolarAngle = options.maxPolarAngle ?? Math.PI * 0.49
  controls.screenSpacePanning = options.screenSpacePanning ?? false

  const target = options.target
  if (target) {
    controls.target.set(target.x, target.y, target.z)
  } else {
    controls.target.set(0, 0, 0)
  }
  controls.update()

  const onChange = () => context.requestRender()
  controls.addEventListener('change', onChange)

  return {
    controls,
    dispose() {
      controls.removeEventListener('change', onChange)
      controls.dispose()
    },
  }
}
