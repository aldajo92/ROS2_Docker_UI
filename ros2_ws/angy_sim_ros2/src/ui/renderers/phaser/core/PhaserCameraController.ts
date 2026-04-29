import * as Phaser from 'phaser'
import type { PhaserSceneContext } from './PhaserSceneContext'

/**
 * Mouse-driven pan + zoom for the Phaser viewport.
 *
 * Implementation strategy: drive Phaser's built-in `Cameras.Scene2D.Camera`
 * (`scrollX/Y`, `zoom`). All world-space coordinates fed by the per-domain
 * sub-renderers stay unchanged — the camera transform is the only thing
 * that moves under the user's pointer. This keeps the architecture clean:
 * the controller never mutates `SimulationState` or any sub-renderer's
 * geometry; vehicles, obstacles, paths, and trails simply scale together
 * because Phaser applies the camera transform globally.
 *
 * Mappings:
 *   - Mouse wheel: zoom in / out, anchored at the cursor's world position
 *     so the pixel under the cursor stays put across the zoom step.
 *   - Left-button drag: pan. Drag delta in screen pixels is converted to
 *     world-space scroll using `1 / camera.zoom`.
 *
 * The controller is intentionally framework-light: it owns no state
 * beyond drag bookkeeping and emits a single `onViewportChange()`
 * callback so the top-level renderer can repaint zoom-dependent overlays
 * (the metric grid, axes gizmo).
 */
export interface PhaserCameraControllerOptions {
  /** Multiplier per wheel notch. Larger = more aggressive zoom. */
  zoomStep?: number
  /** Lower clamp for camera zoom (most zoomed-out). */
  minZoom?: number
  /** Upper clamp for camera zoom (most zoomed-in). */
  maxZoom?: number
  /** Invoked after any pan or zoom change so overlays can redraw. */
  onViewportChange?: () => void
}

const DEFAULT_OPTIONS: Required<Omit<PhaserCameraControllerOptions, 'onViewportChange'>> = {
  zoomStep: 1.1,
  minZoom: 0.1,
  maxZoom: 10,
}

export class PhaserCameraController {
  private readonly context: PhaserSceneContext
  private readonly options: Required<Omit<PhaserCameraControllerOptions, 'onViewportChange'>>
  private readonly onViewportChange?: () => void

  private isDragging = false
  private dragOriginX = 0
  private dragOriginY = 0
  private scrollOriginX = 0
  private scrollOriginY = 0

  private wheelHandler?: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
    deltaZ: number,
  ) => void
  private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void
  private pointerUpHandler?: (pointer: Phaser.Input.Pointer) => void

  constructor(context: PhaserSceneContext, options: PhaserCameraControllerOptions = {}) {
    this.context = context
    this.options = {
      zoomStep: options.zoomStep ?? DEFAULT_OPTIONS.zoomStep,
      minZoom: options.minZoom ?? DEFAULT_OPTIONS.minZoom,
      maxZoom: options.maxZoom ?? DEFAULT_OPTIONS.maxZoom,
    }
    this.onViewportChange = options.onViewportChange
  }

  /** Attach pointer + wheel listeners to the active scene. Idempotent. */
  attach(): void {
    if (this.wheelHandler) return
    const scene = this.context.scene

    this.wheelHandler = (pointer, _over, _dx, deltaY) => {
      this.handleWheel(pointer, deltaY)
    }
    this.pointerDownHandler = (pointer) => {
      // Only treat the primary (left) button as a pan grab so middle /
      // right buttons remain available for future tools.
      if (pointer.button !== 0) return
      this.beginDrag(pointer)
    }
    this.pointerMoveHandler = (pointer) => {
      if (!this.isDragging) return
      this.updateDrag(pointer)
    }
    this.pointerUpHandler = () => {
      this.endDrag()
    }

    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.wheelHandler)
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler)
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler)
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler)
    // `pointerupoutside` covers the case where the user releases the
    // mouse outside the canvas (e.g. dragged past the panel edge).
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpHandler)
  }

  detach(): void {
    const scene = this.context.scene
    if (this.wheelHandler) {
      scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.wheelHandler)
    }
    if (this.pointerDownHandler) {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownHandler)
    }
    if (this.pointerMoveHandler) {
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveHandler)
    }
    if (this.pointerUpHandler) {
      scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpHandler)
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.pointerUpHandler)
    }
    this.wheelHandler = undefined
    this.pointerDownHandler = undefined
    this.pointerMoveHandler = undefined
    this.pointerUpHandler = undefined
    this.isDragging = false
  }

  /** Reset camera to default identity (zoom=1, scroll=(0,0)). */
  resetView(): void {
    const cam = this.context.scene.cameras.main
    cam.setZoom(1)
    cam.setScroll(0, 0)
    this.onViewportChange?.()
  }

  private handleWheel(pointer: Phaser.Input.Pointer, deltaY: number): void {
    const cam = this.context.scene.cameras.main
    const { zoomStep, minZoom, maxZoom } = this.options

    // World point under the cursor BEFORE we change the zoom — we need
    // to keep this pixel anchored under the same screen position after.
    const before = cam.getWorldPoint(pointer.x, pointer.y)

    const factor = deltaY < 0 ? zoomStep : 1 / zoomStep
    const newZoom = Phaser.Math.Clamp(cam.zoom * factor, minZoom, maxZoom)
    if (newZoom === cam.zoom) return

    cam.setZoom(newZoom)

    // After zoom, the same screen pixel maps to a different world point.
    // Adjust scroll so `before` is still under the cursor.
    const after = cam.getWorldPoint(pointer.x, pointer.y)
    cam.scrollX += before.x - after.x
    cam.scrollY += before.y - after.y

    this.onViewportChange?.()
  }

  private beginDrag(pointer: Phaser.Input.Pointer): void {
    const cam = this.context.scene.cameras.main
    this.isDragging = true
    this.dragOriginX = pointer.x
    this.dragOriginY = pointer.y
    this.scrollOriginX = cam.scrollX
    this.scrollOriginY = cam.scrollY
  }

  private updateDrag(pointer: Phaser.Input.Pointer): void {
    const cam = this.context.scene.cameras.main
    // Drag delta in screen pixels — divide by zoom so the world point
    // pinned at drag-start stays under the cursor at any zoom level.
    const dxScreen = pointer.x - this.dragOriginX
    const dyScreen = pointer.y - this.dragOriginY
    cam.scrollX = this.scrollOriginX - dxScreen / cam.zoom
    cam.scrollY = this.scrollOriginY - dyScreen / cam.zoom
    this.onViewportChange?.()
  }

  private endDrag(): void {
    this.isDragging = false
  }
}
