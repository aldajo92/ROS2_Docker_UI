import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { CameraController } from './CameraController'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'

/**
 * Interactive orbit camera: drag to rotate, right-drag to pan, wheel
 * to zoom. Implementation lives entirely in this file — uses the
 * stock `OrbitControls` shipped with `three` (no extra packages, no
 * fiber/drei dependency). Any future tweak to the interaction model
 * (sensitivity, button mapping, kinematic limits) goes here, not in
 * the renderer or the React layer.
 *
 * Render scheduling: `OrbitControls` doesn't request a frame — it
 * just mutates the camera. While the engine is ticking, the next
 * `tick` event repaints anyway. While paused, dragging would be
 * invisible without us forwarding `OrbitControls`'s `change` event
 * to `context.requestRender()`. That's the bridge between
 * "interactive camera" and "event-driven renderer".
 *
 * Damping is intentionally off: with damping enabled, OrbitControls
 * wants `controls.update()` called every frame even when no input is
 * happening, which conflicts with our event-driven render model.
 * Without damping, every `change` we get is the user's actual input
 * and we can paint exactly once per event.
 */
export class OrbitCameraController implements CameraController {
  private readonly initialDistance: number
  private readonly initialHeight: number
  private controls?: OrbitControls
  private onChange?: () => void

  constructor(distance = 12, height = 12) {
    this.initialDistance = distance
    this.initialHeight = height
  }

  attach(context: ThreeSceneContext): void {
    const { camera, renderer } = context

    camera.up.set(0, 1, 0)
    camera.position.set(this.initialDistance, this.initialHeight, this.initialDistance)
    camera.lookAt(0, 0, 0)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0, 0)
    controls.enableDamping = false
    controls.enableRotate = true
    controls.enableZoom = true
    controls.enablePan = true
    controls.zoomSpeed = 0.9
    controls.rotateSpeed = 0.9
    controls.panSpeed = 0.8
    controls.minDistance = 1
    controls.maxDistance = 200
    // Don't let users flip "below" the ground — clamp polar angle.
    controls.maxPolarAngle = Math.PI * 0.49
    controls.update()

    const onChange = () => {
      context.requestRender()
    }
    controls.addEventListener('change', onChange)

    this.controls = controls
    this.onChange = onChange
  }

  update(_state: SimulationState, _context: ThreeSceneContext): void {
    // No-op without damping: the camera is already where the user
    // last placed it. Calling `update()` here would be free, but
    // skipping it keeps the per-tick path zero-work.
  }

  detach(_context: ThreeSceneContext): void {
    if (this.controls && this.onChange) {
      this.controls.removeEventListener('change', this.onChange)
    }
    this.controls?.dispose()
    this.controls = undefined
    this.onChange = undefined
  }

  dispose(): void {
    this.controls?.dispose()
    this.controls = undefined
    this.onChange = undefined
  }
}
