import * as Phaser from 'phaser'
import type { SimulationRenderer } from '../../../../simulation/render/SimulationRenderer'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import {
  DEFAULT_PHASER_RENDERER_CONFIG,
  type PhaserRendererConfig,
  type PhaserTrajectoryVisualizationConfig,
} from '../config/PhaserRendererConfig'
import type { PhaserSceneContext } from './PhaserSceneContext'
import type { PhaserViewport } from '../mapping/simToPhaser'
import { PhaserVehicleRenderer } from '../objects/PhaserVehicleRenderer'
import { PhaserStaticObstacleRenderer } from '../objects/PhaserStaticObstacleRenderer'
import { PhaserDynamicActorRenderer } from '../objects/PhaserDynamicActorRenderer'
import { PhaserPathRenderer } from '../objects/PhaserPathRenderer'
import { PhaserPoseArrayRenderer } from '../objects/PhaserPoseArrayRenderer'
import { PhaserLidarScanRenderer } from '../objects/PhaserLidarScanRenderer'
import {
  PhaserTrajectoryRenderer,
  type PhaserTrajectoryRendererDebugSummary,
} from '../objects/PhaserTrajectoryRenderer'
import { PhaserGroundRenderer } from '../objects/PhaserGroundRenderer'
import { PhaserAxesRenderer } from '../objects/PhaserAxesRenderer'
import {
  PhaserDebugLayer,
  type PhaserDebugLayerOptions,
} from '../debug/PhaserDebugLayer'
import { PhaserCameraController } from './PhaserCameraController'

/**
 * Top-level Phaser renderer. Owns the `Phaser.Game`, the single
 * rendering scene, the shared `PhaserSceneContext`, and every
 * per-domain sub-renderer. It is the only Phaser object the React
 * layer interacts with directly — `PhaserSimulationViewport` knows
 * about this class and nothing else from `phaser`.
 *
 * Strict separation of concerns mirrors the Three.js adapter:
 *   - DOM lifecycle (mount, unmount, resize) is driven by the React
 *     viewport component; this class is framework-agnostic.
 *   - Per-entity rendering lives in `objects/...` and `debug/...`.
 *   - Coordinate conversion lives in `mapping/...`.
 *   - The renderer NEVER mutates `SimulationState`. It only reads
 *     entities, paths, and `state.clock`.
 */
export class PhaserSimulationRenderer implements SimulationRenderer {
  private readonly container: HTMLElement
  private readonly config: PhaserRendererConfig

  private game?: Phaser.Game
  private scene?: Phaser.Scene
  private context?: PhaserSceneContext
  private lastState?: SimulationState

  private groundRenderer?: PhaserGroundRenderer
  private axesRenderer?: PhaserAxesRenderer
  private vehicleRenderer?: PhaserVehicleRenderer
  private staticObstacleRenderer?: PhaserStaticObstacleRenderer
  private dynamicActorRenderer?: PhaserDynamicActorRenderer
  private pathRenderer?: PhaserPathRenderer
  private poseArrayRenderer?: PhaserPoseArrayRenderer
  private lidarScanRenderer?: PhaserLidarScanRenderer
  private trajectoryRenderer?: PhaserTrajectoryRenderer
  private debugLayer?: PhaserDebugLayer
  private cameraController?: PhaserCameraController

  constructor(
    container: HTMLElement,
    config: Partial<PhaserRendererConfig> = {},
  ) {
    this.container = container
    this.config = { ...DEFAULT_PHASER_RENDERER_CONFIG, ...config }
  }

  init(state: SimulationState): void {
    if (this.game) return // Idempotent: tolerate double-init.

    const width = this.container.clientWidth || 1
    const height = this.container.clientHeight || 1

    const onCreated = (scene: Phaser.Scene): void => {
      this.onSceneCreated(scene, state)
    }
    class SimulationScene extends Phaser.Scene {
      constructor() {
        super({ key: 'simulation' })
      }
      create(): void {
        onCreated(this)
      }
    }

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.container,
      width,
      height,
      backgroundColor: this.config.backgroundColor,
      // Phaser's `Scale.RESIZE` mode keeps the canvas at the parent's
      // size on every browser resize automatically — we still listen
      // for the `resize` event below to redraw the grid / axes which
      // depend on the canvas dimensions.
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width,
        height,
      },
      scene: SimulationScene,
      // We don't need Phaser's input handlers, animation system, or
      // physics for a pure-visual renderer.
      banner: false,
      audio: { noAudio: true },
    })
  }

  render(state: SimulationState): void {
    this.lastState = state
    if (!this.scene || !this.context) {
      // Scene `create()` hasn't run yet. Repaint will happen on the
      // next engine event after `sceneReady` resolves; until then the
      // initial `render(state)` we issue from `onSceneCreated` covers
      // the first frame.
      return
    }
    this.syncAll(state)
  }

  resize(): void {
    if (!this.context || !this.scene || !this.game) return
    const w = this.container.clientWidth || 1
    const h = this.container.clientHeight || 1
    this.game.scale.resize(w, h)
    this.recenterViewport()
    this.groundRenderer?.redraw()
    this.axesRenderer?.redraw()
    this.trajectoryRenderer?.reproject()
    if (this.lastState) this.syncAll(this.lastState)
  }

  dispose(): void {
    this.cameraController?.detach()
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

    // `destroy(true)` removes the canvas from the DOM as well, which
    // is exactly what we want when React unmounts the viewport.
    this.game?.destroy(true)

    this.game = undefined
    this.scene = undefined
    this.context = undefined
    this.lastState = undefined
    this.groundRenderer = undefined
    this.axesRenderer = undefined
    this.vehicleRenderer = undefined
    this.staticObstacleRenderer = undefined
    this.dynamicActorRenderer = undefined
    this.pathRenderer = undefined
    this.poseArrayRenderer = undefined
    this.lidarScanRenderer = undefined
    this.trajectoryRenderer = undefined
    this.debugLayer = undefined
    this.cameraController = undefined
  }

  /**
   * Drops cached `Graphics` objects for trajectory lines. Does **not**
   * touch `state.trajectories` — use `controller.clearTrajectories()`
   * to wipe simulation data.
   */
  clearTrajectoryRenderCache(): void {
    this.trajectoryRenderer?.clearRenderCache()
    if (this.lastState) this.syncAll(this.lastState)
  }

  setTrajectoryVisualizationConfig(
    partial: Partial<PhaserTrajectoryVisualizationConfig>,
  ): void {
    this.config.trajectoryVisualization = {
      ...this.config.trajectoryVisualization,
      ...partial,
    }
    this.trajectoryRenderer?.setConfig(partial)
    if (this.lastState) this.syncAll(this.lastState)
  }

  setTrajectoryVisualizationEnabled(enabled: boolean): void {
    this.setTrajectoryVisualizationConfig({ enabled })
  }

  getTrajectoryVisualizationConfig(): PhaserTrajectoryVisualizationConfig {
    return (
      this.trajectoryRenderer?.getConfig() ?? this.config.trajectoryVisualization
    )
  }

  /**
   * Returns a temporary debug snapshot of the trajectory renderer's
   * internal state for visibility/material/positioning diagnosis.
   * Mirrors the Three.js adapter's debug surface.
   */
  getTrajectoryRendererDebugSummary():
    | PhaserTrajectoryRendererDebugSummary
    | undefined {
    return this.trajectoryRenderer?.getDebugSummary()
  }

  /** @deprecated Use {@link clearTrajectoryRenderCache}. Kept so the
   *  React layer's existing reset/scenarioLoaded handlers compile during
   *  the migration. */
  clearTrails(): void {
    this.clearTrajectoryRenderCache()
  }

  /** @deprecated Use {@link setTrajectoryVisualizationConfig}. */
  setTrailConfig(
    partial: Partial<PhaserTrajectoryVisualizationConfig>,
  ): void {
    this.setTrajectoryVisualizationConfig(partial)
  }

  /** @deprecated Use {@link setTrajectoryVisualizationEnabled}. */
  setTrailEnabled(enabled: boolean): void {
    this.setTrajectoryVisualizationEnabled(enabled)
  }

  /** @deprecated Use {@link getTrajectoryVisualizationConfig}. */
  getTrailConfig(): PhaserTrajectoryVisualizationConfig {
    return this.getTrajectoryVisualizationConfig()
  }

  /**
   * Update the debug overlay options (shape-aware bounding outline
   * visibility, vehicle outline shape, heading arrows). No-op if the
   * debug layer was not constructed — i.e. `config.showDebug` was
   * `false` at init time. Mirrors `ThreeSimulationRenderer.setDebugOptions`.
   */
  setDebugOptions(options: Partial<PhaserDebugLayerOptions>): void {
    this.debugLayer?.setOptions(options)
    if (this.lastState) this.syncAll(this.lastState)
  }

  getDebugOptions(): Readonly<PhaserDebugLayerOptions> | undefined {
    return this.debugLayer?.getOptions()
  }

  /** Internal: invoked by the Phaser scene's `create()` once the
   *  display list and camera are alive. Builds the shared context and
   *  every sub-renderer, then issues an initial `render(state)` so
   *  the canvas isn't blank before the engine emits its first tick. */
  private onSceneCreated(scene: Phaser.Scene, state: SimulationState): void {
    this.scene = scene

    const w = scene.scale.width
    const h = scene.scale.height
    const viewport: PhaserViewport = {
      originX: w / 2,
      originY: h / 2,
      pixelsPerMeter: this.config.pixelsPerMeter,
    }

    this.context = {
      game: this.game!,
      scene,
      container: this.container,
      viewport,
    }

    if (this.config.showGrid) {
      this.groundRenderer = new PhaserGroundRenderer(this.context)
      this.groundRenderer.init()
    }
    if (this.config.showAxes) {
      this.axesRenderer = new PhaserAxesRenderer(this.context)
      this.axesRenderer.init()
    }

    this.pathRenderer = new PhaserPathRenderer(this.context)
    this.poseArrayRenderer = new PhaserPoseArrayRenderer(this.context)
    this.lidarScanRenderer = new PhaserLidarScanRenderer(this.context)
    this.staticObstacleRenderer = new PhaserStaticObstacleRenderer(this.context)
    this.dynamicActorRenderer = new PhaserDynamicActorRenderer(this.context)
    this.vehicleRenderer = new PhaserVehicleRenderer(this.context)

    if (this.config.showTrajectories) {
      this.trajectoryRenderer = new PhaserTrajectoryRenderer(
        this.context,
        this.config.trajectoryVisualization,
      )
    }
    if (this.config.showDebug) {
      this.debugLayer = new PhaserDebugLayer(this.context)
    }

    // Mouse pan + zoom. The controller drives the scene's main camera
    // (scrollX/Y, zoom); world-space geometry stays untouched. We only
    // need to refresh the metric grid on every viewport change because
    // it's the one overlay that's sized to the visible world rect.
    this.cameraController = new PhaserCameraController(this.context, {
      onViewportChange: () => {
        this.groundRenderer?.redraw()
      },
    })
    this.cameraController.attach()

    // Phaser `Scale.RESIZE` fires its own resize event when the canvas
    // changes size; tie our redraw + reproject in there so external
    // CSS-driven resizes (e.g. inspector panel toggles) keep the
    // origin centered.
    scene.scale.on('resize', () => {
      this.recenterViewport()
      this.groundRenderer?.redraw()
      this.axesRenderer?.redraw()
      this.trajectoryRenderer?.reproject()
      if (this.lastState) this.syncAll(this.lastState)
    })

    // First frame so the user sees the static scene before pressing Start.
    this.syncAll(state)
  }

  private syncAll(state: SimulationState): void {
    this.pathRenderer?.sync(state)
    this.poseArrayRenderer?.sync(state)
    this.lidarScanRenderer?.sync(state)
    this.staticObstacleRenderer?.sync(state)
    this.dynamicActorRenderer?.sync(state)
    this.vehicleRenderer?.sync(state)
    this.trajectoryRenderer?.sync(state)
    this.debugLayer?.sync(state)
  }

  private recenterViewport(): void {
    if (!this.scene || !this.context) return
    this.context.viewport.originX = this.scene.scale.width / 2
    this.context.viewport.originY = this.scene.scale.height / 2
  }
}
