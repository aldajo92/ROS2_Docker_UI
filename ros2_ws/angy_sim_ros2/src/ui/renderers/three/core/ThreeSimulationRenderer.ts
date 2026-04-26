import * as THREE from 'three'
import type { SimulationRenderer } from '../../../../simulation/render/SimulationRenderer'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from './ThreeSceneContext'
import { ThreeGroundRenderer } from '../objects/ThreeGroundRenderer'
import { ThreeAxesRenderer } from '../objects/ThreeAxesRenderer'
import { ThreeVehicleRenderer } from '../objects/ThreeVehicleRenderer'
import { ThreeStaticObstacleRenderer } from '../objects/ThreeStaticObstacleRenderer'
import { ThreeDynamicActorRenderer } from '../objects/ThreeDynamicActorRenderer'
import { ThreeTrailRenderer } from '../objects/ThreeTrailRenderer'
import { ThreePathRenderer } from '../objects/ThreePathRenderer'
import { ThreeDebugLayer } from '../debug/ThreeDebugLayer'
import { CameraControllerManager } from '../cameras/CameraControllerManager'
import {
  DEFAULT_THREE_RENDERER_CONFIG,
  type ThreeRendererConfig,
  type ThreeTrailConfig,
} from '../config/ThreeRendererConfig'
import type { CameraMode } from '../cameras/CameraMode'
import type { Projection } from '../cameras/Projection'

/**
 * Top-level Three.js renderer. Owns the scene, camera, WebGL renderer,
 * lights, and every per-domain sub-renderer. It is the only Three.js
 * object the React layer interacts with directly.
 *
 * Strict separation of concerns:
 *   - DOM lifecycle (mount, unmount, resize) is driven by the
 *     `ThreeSimulationViewport` React component; this class is
 *     framework-agnostic.
 *   - Per-entity rendering lives in `objects/...`.
 *   - Coordinate conversion lives in `mapping/...`.
 *   - The renderer NEVER mutates `SimulationState`.
 */
export class ThreeSimulationRenderer implements SimulationRenderer {
  private readonly container: HTMLElement
  private readonly config: ThreeRendererConfig

  private context?: ThreeSceneContext
  /** Last state passed to `render()`. Used to re-paint on demand
   *  (e.g. after an OrbitControls "change" event while paused). */
  private lastState?: SimulationState

  private groundRenderer?: ThreeGroundRenderer
  private axesRenderer?: ThreeAxesRenderer
  private vehicleRenderer?: ThreeVehicleRenderer
  private staticObstacleRenderer?: ThreeStaticObstacleRenderer
  private dynamicActorRenderer?: ThreeDynamicActorRenderer
  private trailRenderer?: ThreeTrailRenderer
  private pathRenderer?: ThreePathRenderer
  private debugLayer?: ThreeDebugLayer
  private cameraControllerManager?: CameraControllerManager
  private projection: Projection

  constructor(container: HTMLElement, config: Partial<ThreeRendererConfig> = {}) {
    this.container = container
    this.config = { ...DEFAULT_THREE_RENDERER_CONFIG, ...config }
    this.projection = this.config.projection
  }

  init(state: SimulationState): void {
    if (this.context) return // Idempotent: tolerate double-init.

    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111118)

    const camera = this.createCamera(this.projection, width, height)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    this.container.appendChild(renderer.domElement)

    this.context = {
      scene,
      camera,
      renderer,
      container: this.container,
      requestRender: () => {
        if (this.lastState) this.render(this.lastState)
      },
    }

    this.addLights(scene)

    if (this.config.showGrid) {
      this.groundRenderer = new ThreeGroundRenderer(this.context, true)
      this.groundRenderer.init()
    }
    if (this.config.showAxes) {
      this.axesRenderer = new ThreeAxesRenderer(this.context)
      this.axesRenderer.init()
    }

    this.vehicleRenderer = new ThreeVehicleRenderer(this.context)
    this.staticObstacleRenderer = new ThreeStaticObstacleRenderer(this.context)
    this.dynamicActorRenderer = new ThreeDynamicActorRenderer(this.context)
    this.trailRenderer = new ThreeTrailRenderer(this.context, this.config.trail)
    this.pathRenderer = new ThreePathRenderer(this.context)

    if (this.config.showDebug) {
      this.debugLayer = new ThreeDebugLayer(this.context)
    }

    this.cameraControllerManager = new CameraControllerManager(
      this.context,
      this.config.cameraMode,
    )

    // Initial frame so the user sees the static scene before pressing Start.
    this.render(state)
  }

  render(state: SimulationState): void {
    if (!this.context) return
    this.lastState = state

    this.pathRenderer?.sync(state)
    this.vehicleRenderer?.sync(state)
    this.staticObstacleRenderer?.sync(state)
    this.dynamicActorRenderer?.sync(state)
    this.trailRenderer?.sync(state)
    this.debugLayer?.sync(state)

    this.cameraControllerManager?.update(state)

    this.context.renderer.render(this.context.scene, this.context.camera)
  }

  resize(): void {
    if (!this.context) return

    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1

    const camera = this.context.camera
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    } else if (camera instanceof THREE.OrthographicCamera) {
      // Recompute the orthographic frustum so the scene neither
      // squashes nor crops on aspect changes. Vertical extent is
      // fixed (`orthoFrustumHeight`); horizontal extent follows aspect.
      const frustumH = this.config.orthoFrustumHeight
      const aspect = width / height
      camera.left = (-frustumH * aspect) / 2
      camera.right = (frustumH * aspect) / 2
      camera.top = frustumH / 2
      camera.bottom = -frustumH / 2
      camera.updateProjectionMatrix()
    }

    this.context.renderer.setSize(width, height)
  }

  dispose(): void {
    this.cameraControllerManager?.dispose()
    this.debugLayer?.dispose()
    this.pathRenderer?.dispose()
    this.trailRenderer?.dispose()
    this.dynamicActorRenderer?.dispose()
    this.staticObstacleRenderer?.dispose()
    this.vehicleRenderer?.dispose()
    this.axesRenderer?.dispose()
    this.groundRenderer?.dispose()

    if (this.context) {
      const canvas = this.context.renderer.domElement
      this.context.renderer.dispose()
      if (canvas.parentElement) {
        canvas.parentElement.removeChild(canvas)
      }
    }

    this.context = undefined
    this.lastState = undefined
    this.groundRenderer = undefined
    this.axesRenderer = undefined
    this.vehicleRenderer = undefined
    this.staticObstacleRenderer = undefined
    this.dynamicActorRenderer = undefined
    this.trailRenderer = undefined
    this.pathRenderer = undefined
    this.debugLayer = undefined
    this.cameraControllerManager = undefined
  }

  /** Wipe trails — call from `reset` / `scenarioLoaded` event handlers. */
  clearTrails(): void {
    this.trailRenderer?.clear()
    if (this.lastState) this.render(this.lastState)
  }

  /**
   * Apply a partial trail-config update. The trail renderer takes
   * effect immediately (color / opacity / height / max-points / etc.
   * are reflected on the next paint), and we trigger a render so the
   * change is visible even if the simulation is paused.
   */
  setTrailConfig(config: Partial<ThreeTrailConfig>): void {
    this.config.trail = { ...this.config.trail, ...config }
    this.trailRenderer?.setConfig(config)
    if (this.lastState) this.render(this.lastState)
  }

  setTrailEnabled(enabled: boolean): void {
    this.setTrailConfig({ enabled })
  }

  getTrailConfig(): ThreeTrailConfig {
    return this.trailRenderer?.getConfig() ?? this.config.trail
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraControllerManager?.setMode(mode)
  }

  getCameraMode(): CameraMode | undefined {
    return this.cameraControllerManager?.getMode()
  }

  /**
   * Swap the underlying camera between perspective and orthographic.
   * The active controller (e.g. OrbitControls) is rebound against
   * the new camera object via `cameraControllerManager.reattachActive()`.
   * Idempotent: same projection is a no-op.
   */
  setProjection(projection: Projection): void {
    if (!this.context) return
    if (projection === this.projection) return

    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1
    const newCamera = this.createCamera(projection, width, height)

    this.context.camera = newCamera
    this.projection = projection

    this.cameraControllerManager?.reattachActive()

    if (this.lastState) this.render(this.lastState)
  }

  getProjection(): Projection {
    return this.projection
  }

  private createCamera(
    projection: Projection,
    width: number,
    height: number,
  ): THREE.PerspectiveCamera | THREE.OrthographicCamera {
    if (projection === 'perspective') {
      return new THREE.PerspectiveCamera(60, width / height, 0.1, 1000)
    }
    const frustumH = this.config.orthoFrustumHeight
    const aspect = width / height
    return new THREE.OrthographicCamera(
      (-frustumH * aspect) / 2,
      (frustumH * aspect) / 2,
      frustumH / 2,
      -frustumH / 2,
      0.1,
      1000,
    )
  }

  private addLights(scene: THREE.Scene): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55)
    scene.add(ambient)

    const directional = new THREE.DirectionalLight(0xffffff, 1.0)
    directional.position.set(8, 12, 8)
    scene.add(directional)
  }
}
