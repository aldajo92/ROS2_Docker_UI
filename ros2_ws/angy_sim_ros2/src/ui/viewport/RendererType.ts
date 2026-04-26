/**
 * Discriminator for the active renderer adapter. Lives in React UI
 * state, NEVER in `SimulationState`: which renderer is mounted is a
 * presentation choice with no effect on simulation semantics.
 *
 * Adding a new adapter is a three-step change:
 *   1. Add the literal here.
 *   2. Add a `case` in `SimulationViewportSwitcher`.
 *   3. Add a `<option>` in the renderer selector UI (`ControlPanel`).
 */
export type RendererType = 'three' | 'phaser'

export const DEFAULT_RENDERER_TYPE: RendererType = 'three'

export const RENDERER_LABELS: Record<RendererType, string> = {
  three: 'Three.js',
  phaser: 'Phaser',
}
