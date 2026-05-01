/**
 * Debug overlay configuration shared by the Three.js and Phaser debug
 * layers. Lives under `src/ui/renderers/debug/` so both adapters can
 * import the same type and defaults — this is the piece that makes
 * the Inspector control "which renderer is active" agnostic.
 *
 * This config is runtime-only. It is not persisted to replay files and
 * must not be mutated from inside `src/simulation/` or `src/math/`.
 * The React shell owns the state; the renderer-specific debug layers
 * consume a snapshot of it on every `setDebugOptions` call.
 */

/** How vehicle bounding outlines are drawn. Applied only to
 *  `VehicleEntity`; all other entities (static obstacles, dynamic
 *  actors) pick their shape from their own geometry. */
export type VehicleBoundingOutlineShape = 'circle' | 'rectangle'

/**
 * User-facing debug overlay knobs. Minimal by design — each field maps
 * to a single, observable behavior in both renderers.
 *
 * Backward-compat note: this replaces the former per-renderer
 * `showBoundingCircles` flag. The default of `showBoundingOutlines:
 * true` preserves the previous behavior (bounding overlay visible on
 * by default).
 */
export interface DebugOverlayConfig {
  /** Master toggle for the shape-aware bounding outline overlay. When
   *  `false`, no outlines are drawn regardless of entity shape. */
  showBoundingOutlines: boolean
  /** Shape used for the **vehicle** bounding outline. Static obstacles
   *  and dynamic actors always match their own geometry and ignore
   *  this field. */
  vehicleBoundingOutlineShape: VehicleBoundingOutlineShape
}

export const DEFAULT_DEBUG_OVERLAY_CONFIG: DebugOverlayConfig = {
  showBoundingOutlines: true,
  vehicleBoundingOutlineShape: 'circle',
}
