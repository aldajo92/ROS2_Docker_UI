import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { BoundingCircleRenderer } from './BoundingCircleRenderer'
import { HeadingArrowRenderer } from './HeadingArrowRenderer'
import { VelocityVectorRenderer } from './VelocityVectorRenderer'
import { CollisionHighlightRenderer } from './CollisionHighlightRenderer'

/**
 * Aggregates the debug overlays. Each flag is independent so future
 * UI panels can toggle individual layers; today only `showDebug`
 * gates the whole bundle, but that's a single property change in
 * `ThreeRendererConfig` away.
 */
export interface ThreeDebugLayerOptions {
  showBoundingCircles: boolean
  showHeadingArrows: boolean
  showVelocityVectors: boolean
  showCollisionHighlights: boolean
}

const DEFAULT_DEBUG_OPTIONS: ThreeDebugLayerOptions = {
  showBoundingCircles: true,
  showHeadingArrows: true,
  showVelocityVectors: false,
  showCollisionHighlights: false,
}

export class ThreeDebugLayer {
  private readonly bounding: BoundingCircleRenderer
  private readonly heading: HeadingArrowRenderer
  private readonly velocity: VelocityVectorRenderer
  private readonly collision: CollisionHighlightRenderer
  private options: ThreeDebugLayerOptions

  constructor(context: ThreeSceneContext, options?: Partial<ThreeDebugLayerOptions>) {
    this.bounding = new BoundingCircleRenderer(context)
    this.heading = new HeadingArrowRenderer(context)
    this.velocity = new VelocityVectorRenderer(context)
    this.collision = new CollisionHighlightRenderer(context)
    this.options = { ...DEFAULT_DEBUG_OPTIONS, ...options }
  }

  setOptions(options: Partial<ThreeDebugLayerOptions>): void {
    this.options = { ...this.options, ...options }
    if (!this.options.showBoundingCircles) this.bounding.dispose()
    if (!this.options.showHeadingArrows) this.heading.dispose()
    if (!this.options.showVelocityVectors) this.velocity.dispose()
  }

  sync(state: SimulationState): void {
    if (this.options.showBoundingCircles) this.bounding.sync(state)
    if (this.options.showHeadingArrows) this.heading.sync(state)
    if (this.options.showVelocityVectors) this.velocity.sync(state)
    if (this.options.showCollisionHighlights) this.collision.sync(state)
  }

  dispose(): void {
    this.bounding.dispose()
    this.heading.dispose()
    this.velocity.dispose()
    this.collision.dispose()
  }
}
