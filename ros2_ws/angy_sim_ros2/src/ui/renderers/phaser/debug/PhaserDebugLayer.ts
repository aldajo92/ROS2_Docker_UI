import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserBoundingOutlineRenderer } from './PhaserBoundingOutlineRenderer'
import { PhaserHeadingArrowRenderer } from './PhaserHeadingArrowRenderer'
import {
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  type DebugOverlayConfig,
} from '../../debug/DebugOverlayConfig'

/**
 * Aggregates the Phaser debug overlays. Same role as `ThreeDebugLayer`,
 * but with the smaller subset that's currently meaningful in 2D
 * top-down view (no velocity vector / collision highlight yet — those
 * can be ported when needed).
 *
 * Shape-aware bounding outline: replaces the legacy
 * `showBoundingCircles` flag. Keeps the default to `true` so existing
 * callers see the outline on by default, matching the previous look.
 */
export interface PhaserDebugLayerOptions {
  /** Master toggle for the shape-aware bounding outline overlay. */
  showBoundingOutlines: boolean
  /** Shape used for the vehicle bounding outline. */
  vehicleBoundingOutlineShape: DebugOverlayConfig['vehicleBoundingOutlineShape']
  showHeadingArrows: boolean
}

const DEFAULT_DEBUG_OPTIONS: PhaserDebugLayerOptions = {
  showBoundingOutlines: DEFAULT_DEBUG_OVERLAY_CONFIG.showBoundingOutlines,
  vehicleBoundingOutlineShape:
    DEFAULT_DEBUG_OVERLAY_CONFIG.vehicleBoundingOutlineShape,
  showHeadingArrows: true,
}

export class PhaserDebugLayer {
  private readonly bounding: PhaserBoundingOutlineRenderer
  private readonly heading: PhaserHeadingArrowRenderer
  private options: PhaserDebugLayerOptions

  constructor(
    context: PhaserSceneContext,
    options?: Partial<PhaserDebugLayerOptions>,
  ) {
    this.options = { ...DEFAULT_DEBUG_OPTIONS, ...options }
    this.bounding = new PhaserBoundingOutlineRenderer(context, {
      vehicleBoundingOutlineShape: this.options.vehicleBoundingOutlineShape,
    })
    this.heading = new PhaserHeadingArrowRenderer(context)
  }

  setOptions(options: Partial<PhaserDebugLayerOptions>): void {
    this.options = { ...this.options, ...options }
    if (!this.options.showBoundingOutlines) this.bounding.dispose()
    if (!this.options.showHeadingArrows) this.heading.dispose()
    this.bounding.setConfig({
      vehicleBoundingOutlineShape: this.options.vehicleBoundingOutlineShape,
    })
  }

  getOptions(): Readonly<PhaserDebugLayerOptions> {
    return this.options
  }

  sync(state: SimulationState): void {
    if (this.options.showBoundingOutlines) this.bounding.sync(state)
    if (this.options.showHeadingArrows) this.heading.sync(state)
  }

  dispose(): void {
    this.bounding.dispose()
    this.heading.dispose()
  }
}
