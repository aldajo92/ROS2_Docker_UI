import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserBoundingCircleRenderer } from './PhaserBoundingCircleRenderer'
import { PhaserHeadingArrowRenderer } from './PhaserHeadingArrowRenderer'

/**
 * Aggregates the Phaser debug overlays. Same role as `ThreeDebugLayer`,
 * but with the smaller subset that's currently meaningful in 2D
 * top-down view (no velocity vector / collision highlight yet — those
 * can be ported when needed).
 */
export interface PhaserDebugLayerOptions {
  showBoundingCircles: boolean
  showHeadingArrows: boolean
}

const DEFAULT_DEBUG_OPTIONS: PhaserDebugLayerOptions = {
  showBoundingCircles: true,
  showHeadingArrows: true,
}

export class PhaserDebugLayer {
  private readonly bounding: PhaserBoundingCircleRenderer
  private readonly heading: PhaserHeadingArrowRenderer
  private options: PhaserDebugLayerOptions

  constructor(
    context: PhaserSceneContext,
    options?: Partial<PhaserDebugLayerOptions>,
  ) {
    this.bounding = new PhaserBoundingCircleRenderer(context)
    this.heading = new PhaserHeadingArrowRenderer(context)
    this.options = { ...DEFAULT_DEBUG_OPTIONS, ...options }
  }

  setOptions(options: Partial<PhaserDebugLayerOptions>): void {
    this.options = { ...this.options, ...options }
    if (!this.options.showBoundingCircles) this.bounding.dispose()
    if (!this.options.showHeadingArrows) this.heading.dispose()
  }

  sync(state: SimulationState): void {
    if (this.options.showBoundingCircles) this.bounding.sync(state)
    if (this.options.showHeadingArrows) this.heading.sync(state)
  }

  dispose(): void {
    this.bounding.dispose()
    this.heading.dispose()
  }
}
