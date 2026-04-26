import type Phaser from 'phaser'
import type { PhaserViewport } from '../mapping/simToPhaser'

/**
 * Shared resources every Phaser sub-renderer needs. Passed by reference
 * into every constructor so each renderer can attach to the active
 * scene's display list without each one creating its own copy.
 *
 * Lifecycle: the top-level `PhaserSimulationRenderer` owns a single
 * `Phaser.Game` and a single `Phaser.Scene`. Sub-renderers must NOT
 * create their own scenes or games — they only add `GameObjects` to
 * `scene.add` and read `viewport` for layout.
 *
 * The context's `viewport` is mutable (the renderer updates `originX` /
 * `originY` on resize so the simulation origin stays centered). Any
 * sub-renderer can re-read it on every sync to react to canvas size
 * changes — `simPoint2DToPhaser` is cheap.
 *
 * `requestRender` is intentionally absent: Phaser drives its own
 * render loop via `requestAnimationFrame`. Repaint requests should be
 * folded into the sync pass, not pushed back through the scene.
 */
export interface PhaserSceneContext {
  /** Top-level game instance. Useful for `game.scale.gameSize` and
   *  for tearing down the canvas on dispose. Sub-renderers should
   *  rarely touch it directly. */
  game: Phaser.Game
  /** The single rendering scene. All `GameObjects` go here. */
  scene: Phaser.Scene
  /** DOM container the canvas was mounted into. Owned by the React
   *  viewport component; renderers must not detach the canvas. */
  container: HTMLElement
  /** Live mapping parameters — origin position, pixels-per-meter.
   *  Mutable: the renderer updates these on resize. */
  viewport: PhaserViewport
}
