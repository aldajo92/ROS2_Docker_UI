import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { BoundingOutlineRenderer } from './BoundingOutlineRenderer'
import { HeadingArrowRenderer } from './HeadingArrowRenderer'
import { VelocityVectorRenderer } from './VelocityVectorRenderer'
import { CollisionHighlightRenderer } from './CollisionHighlightRenderer'
import {
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  type DebugOverlayConfig,
} from '../../debug/DebugOverlayConfig'

/**
 * Aggregates the Three.js debug overlays. Each flag is independent so
 * Inspector panels can toggle overlays individually; the renderer-
 * level `config.showDebug` still gates whether this whole layer is
 * constructed in the first place.
 *
 * Shape-aware bounding outline: replaces the legacy
 * `showBoundingCircles` flag with `showBoundingOutlines`, which
 * applies to the shape-aware `BoundingOutlineRenderer`. The vehicle
 * outline shape (`circle` / `rectangle`) is carried on the same
 * options object so it can be driven from a single React control.
 */
export interface ThreeDebugLayerOptions {
  /** Master toggle for the shape-aware bounding outline overlay. */
  showBoundingOutlines: boolean
  /** Shape used for the vehicle bounding outline. Static obstacles and
   *  dynamic actors always match their own geometry and ignore this. */
  vehicleBoundingOutlineShape: DebugOverlayConfig['vehicleBoundingOutlineShape']
  showHeadingArrows: boolean
  showVelocityVectors: boolean
  showCollisionHighlights: boolean
}

const DEFAULT_DEBUG_OPTIONS: ThreeDebugLayerOptions = {
  showBoundingOutlines: DEFAULT_DEBUG_OVERLAY_CONFIG.showBoundingOutlines,
  vehicleBoundingOutlineShape:
    DEFAULT_DEBUG_OVERLAY_CONFIG.vehicleBoundingOutlineShape,
  showHeadingArrows: true,
  showVelocityVectors: false,
  showCollisionHighlights: false,
}

export class ThreeDebugLayer {
  private readonly bounding: BoundingOutlineRenderer
  private readonly heading: HeadingArrowRenderer
  private readonly velocity: VelocityVectorRenderer
  private readonly collision: CollisionHighlightRenderer
  private options: ThreeDebugLayerOptions

  constructor(context: ThreeSceneContext, options?: Partial<ThreeDebugLayerOptions>) {
    this.options = { ...DEFAULT_DEBUG_OPTIONS, ...options }
    this.bounding = new BoundingOutlineRenderer(context, {
      vehicleBoundingOutlineShape: this.options.vehicleBoundingOutlineShape,
    })
    this.heading = new HeadingArrowRenderer(context)
    this.velocity = new VelocityVectorRenderer(context)
    this.collision = new CollisionHighlightRenderer(context)
  }

  setOptions(options: Partial<ThreeDebugLayerOptions>): void {
    this.options = { ...this.options, ...options }
    if (!this.options.showBoundingOutlines) this.bounding.dispose()
    if (!this.options.showHeadingArrows) this.heading.dispose()
    if (!this.options.showVelocityVectors) this.velocity.dispose()
    this.bounding.setConfig({
      vehicleBoundingOutlineShape: this.options.vehicleBoundingOutlineShape,
    })
  }

  getOptions(): Readonly<ThreeDebugLayerOptions> {
    return this.options
  }

  sync(state: SimulationState): void {
    if (this.options.showBoundingOutlines) this.bounding.sync(state)
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
