import * as THREE from 'three'
import {
  derror,
  isRenderDebugEnabled,
  readMemoryMB,
  throttledLog,
} from '../../../../debug/RenderDebug'
import type { SimulationRenderer } from '../../../../simulation/render/SimulationRenderer'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from './ThreeSceneContext'
import { ThreeGroundRenderer } from '../objects/ThreeGroundRenderer'
import { ThreeAxesRenderer } from '../objects/ThreeAxesRenderer'
import { ThreeVehicleRenderer } from '../objects/ThreeVehicleRenderer'
import { ThreeStaticObstacleRenderer } from '../objects/ThreeStaticObstacleRenderer'
import { ThreeDynamicActorRenderer } from '../objects/ThreeDynamicActorRenderer'
import {
  ThreeTrajectoryRenderer,
  type ThreeTrajectoryRendererDebugSummary,
} from '../objects/ThreeTrajectoryRenderer'
import { ThreePathRenderer } from '../objects/ThreePathRenderer'
import { ThreePoseArrayRenderer } from '../objects/ThreePoseArrayRenderer'
import { ThreeLidarScanRenderer } from '../objects/ThreeLidarScanRenderer'
import { ThreeDebugLayer, type ThreeDebugLayerOptions } from '../debug/ThreeDebugLayer'
import { CameraControllerManager } from '../cameras/CameraControllerManager'
import {
  DEFAULT_THREE_RENDERER_CONFIG,
  type ThreeRendererConfig,
  type ThreeTrajectoryVisualizationConfig,
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
  private config: ThreeRendererConfig

  private context?: ThreeSceneContext
  /** Last state passed to `render()`. Used to re-paint on demand
   *  (e.g. after an OrbitControls "change" event while paused). */
  private lastState?: SimulationState

  private groundRenderer?: ThreeGroundRenderer
  private axesRenderer?: ThreeAxesRenderer
  private vehicleRenderer?: ThreeVehicleRenderer
  private staticObstacleRenderer?: ThreeStaticObstacleRenderer
  private dynamicActorRenderer?: ThreeDynamicActorRenderer
  private trajectoryRenderer?: ThreeTrajectoryRenderer
  private pathRenderer?: ThreePathRenderer
  private poseArrayRenderer?: ThreePoseArrayRenderer
  private lidarScanRenderer?: ThreeLidarScanRenderer
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

    this.pathRenderer = new ThreePathRenderer(this.context)
    this.poseArrayRenderer = new ThreePoseArrayRenderer(this.context)
    this.lidarScanRenderer = new ThreeLidarScanRenderer(this.context)
    this.trajectoryRenderer = new ThreeTrajectoryRenderer(
      this.context,
      this.config.trajectoryVisualization,
    )
    this.vehicleRenderer = new ThreeVehicleRenderer(this.context)
    this.staticObstacleRenderer = new ThreeStaticObstacleRenderer(this.context)
    this.dynamicActorRenderer = new ThreeDynamicActorRenderer(this.context)

    if (this.config.showDebug) {
      this.debugLayer = new ThreeDebugLayer(this.context)
    }

    this.cameraControllerManager = new CameraControllerManager(
      this.context,
      this.config.cameraMode,
    )

    this.render(state)
  }

  render(state: SimulationState): void {
    if (!this.context) return
    this.lastState = state

    // Per-step instrumentation. Wrapped so a throw from any single
    // sub-renderer (geometry, debug layer, camera controller, GL
    // submit) cannot kill the engine event-bus iteration — that would
    // also stop *Phaser* from rendering, since both viewports are
    // listeners on the same `tick` channel.
    const debug = isRenderDebugEnabled()
    const t0 = debug ? perfNow() : 0

    let pathErr: unknown = undefined
    try {
      this.pathRenderer?.sync(state)
    } catch (err) {
      pathErr = err
      derror('ThreeRenderer', 'pathRenderer.sync threw:', err)
    }
    try {
      this.poseArrayRenderer?.sync(state)
    } catch (err) {
      derror('ThreeRenderer', 'poseArrayRenderer.sync threw:', err)
    }
    try {
      this.lidarScanRenderer?.sync(state)
    } catch (err) {
      derror('ThreeRenderer', 'lidarScanRenderer.sync threw:', err)
    }
    const tPath = debug ? perfNow() : 0

    try {
      this.trajectoryRenderer?.sync(state)
    } catch (err) {
      derror('ThreeRenderer', 'trajectoryRenderer.sync threw:', err)
    }
    const tTraj = debug ? perfNow() : 0

    try {
      this.vehicleRenderer?.sync(state)
      this.staticObstacleRenderer?.sync(state)
      this.dynamicActorRenderer?.sync(state)
      this.debugLayer?.sync(state)
    } catch (err) {
      derror('ThreeRenderer', 'entity sync threw:', err)
    }
    const tEntities = debug ? perfNow() : 0

    try {
      this.cameraControllerManager?.update(state)
    } catch (err) {
      derror('ThreeRenderer', 'camera update threw:', err)
    }
    const tCamera = debug ? perfNow() : 0

    try {
      this.context.renderer.render(this.context.scene, this.context.camera)
    } catch (err) {
      derror('ThreeRenderer', 'WebGL render threw:', err)
    }
    const tGL = debug ? perfNow() : 0

    if (debug) {
      throttledLog('ThreeRenderer', 'render:summary', () => {
        const sceneObjectCount = countSceneObjects(this.context!.scene)
        const info = this.context!.renderer.info
        const mem = readMemoryMB()
        return [
          `pathMs=${(tPath - t0).toFixed(2)}`,
          `trajMs=${(tTraj - tPath).toFixed(2)}`,
          `entitiesMs=${(tEntities - tTraj).toFixed(2)}`,
          `cameraMs=${(tCamera - tEntities).toFixed(2)}`,
          `glMs=${(tGL - tCamera).toFixed(2)}`,
          `totalMs=${(tGL - t0).toFixed(2)}`,
          `sceneObjects=${sceneObjectCount}`,
          `glCalls=${info.render.calls}`,
          `glTriangles=${info.render.triangles}`,
          `glGeometries=${info.memory.geometries}`,
          `glTextures=${info.memory.textures}`,
          mem ? `memMB=${mem.usedMB.toFixed(1)}/${mem.limitMB.toFixed(0)}` : 'memMB=n/a',
          pathErr ? `pathErr=1` : 'pathErr=0',
        ]
      })
    }
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
    this.lidarScanRenderer?.dispose()
    this.poseArrayRenderer?.dispose()
    this.pathRenderer?.dispose()
    this.trajectoryRenderer?.dispose()
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
    this.trajectoryRenderer = undefined
    this.pathRenderer = undefined
    this.poseArrayRenderer = undefined
    this.lidarScanRenderer = undefined
    this.debugLayer = undefined
    this.cameraControllerManager = undefined
  }

  /**
   * Clears GPU line objects only. Does not modify `state.trajectories`.
   * Use `SimulationController.clearTrajectories()` to wipe simulation data.
   */
  clearTrajectoryRenderCache(): void {
    this.trajectoryRenderer?.clearRenderCache()
    if (this.lastState) this.render(this.lastState)
  }

  setTrajectoryVisualizationConfig(
    partial: Partial<ThreeTrajectoryVisualizationConfig>,
  ): void {
    const wasEnabled = this.config.trajectoryVisualization.enabled
    this.config.trajectoryVisualization = {
      ...this.config.trajectoryVisualization,
      ...partial,
    }
    this.trajectoryRenderer?.setConfig(partial)
    const toggledOn =
      partial.enabled === true && wasEnabled !== this.config.trajectoryVisualization.enabled
    if (toggledOn) {
      // Defensive rebuild: if UI toggles visibility back on after a cache-only
      // hide path, force a clean line reconstruction from state.trajectories.
      this.trajectoryRenderer?.clearRenderCache()
    }
    if (this.lastState) this.render(this.lastState)
  }

  setTrajectoryVisualizationEnabled(enabled: boolean): void {
    this.setTrajectoryVisualizationConfig({ enabled })
  }

  getTrajectoryVisualizationConfig(): ThreeTrajectoryVisualizationConfig {
    return (
      this.trajectoryRenderer?.getConfig() ?? this.config.trajectoryVisualization
    )
  }

  /** @deprecated Use {@link clearTrajectoryRenderCache} — does not clear sim state. */
  clearTrails(): void {
    this.clearTrajectoryRenderCache()
  }

  /** @deprecated Use {@link setTrajectoryVisualizationConfig} */
  setTrailConfig(partial: Partial<ThreeTrajectoryVisualizationConfig>): void {
    this.setTrajectoryVisualizationConfig(partial)
  }

  /** @deprecated Use {@link setTrajectoryVisualizationEnabled} */
  setTrailEnabled(enabled: boolean): void {
    this.setTrajectoryVisualizationEnabled(enabled)
  }

  /** @deprecated Use {@link getTrajectoryVisualizationConfig} */
  getTrailConfig(): ThreeTrajectoryVisualizationConfig {
    return this.getTrajectoryVisualizationConfig()
  }

  /**
   * Returns a temporary debug snapshot of the trajectory renderer's
   * internal state for visibility/material/positioning diagnosis.
   * Not part of the long-term API.
   */
  getTrajectoryRendererDebugSummary():
    | ThreeTrajectoryRendererDebugSummary
    | undefined {
    return this.trajectoryRenderer?.getDebugSummary()
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraControllerManager?.setMode(mode)
  }

  getCameraMode(): CameraMode | undefined {
    return this.cameraControllerManager?.getMode()
  }

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

  /**
   * Update the debug overlay options (shape-aware bounding outline
   * visibility, vehicle outline shape, heading arrow visibility, …).
   * No-op when the debug layer was not constructed — i.e. when
   * `config.showDebug` was `false` at init time. Options are merged
   * into the layer's current options; only the fields present on the
   * argument are applied.
   */
  setDebugOptions(options: Partial<ThreeDebugLayerOptions>): void {
    this.debugLayer?.setOptions(options)
    if (this.lastState) this.render(this.lastState)
  }

  /** Debug-only helper; returns `undefined` if the debug layer is off. */
  getDebugOptions(): Readonly<ThreeDebugLayerOptions> | undefined {
    return this.debugLayer?.getOptions()
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

function perfNow(): number {
  const perf = (
    globalThis as unknown as { performance?: { now?: () => number } }
  ).performance
  return perf?.now?.() ?? Date.now()
}

/**
 * Recursively counts every `THREE.Object3D` descendant of `root`,
 * including the root itself. Used as a coarse "is the scene
 * accumulating objects?" signal in the throttled debug summary.
 */
function countSceneObjects(root: THREE.Object3D): number {
  let count = 0
  root.traverse(() => {
    count += 1
  })
  return count
}
