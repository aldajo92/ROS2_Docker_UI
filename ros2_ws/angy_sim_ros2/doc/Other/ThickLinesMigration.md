# Migrate ThreePathRenderer to Three.js fat lines (Line2)

## Context

The per-topic visualization settings panel already exposes a **thickness** value
through the full data pipeline:

```
UI (Ros2TopicsPanel)
  → setVisualConfig({ thickness })
  → RosbridgeRenderableTopics stamps path.thickness
  → Path2D carries thickness
  → ExternalPathUpdateQueue → ExternalPathRenderSystem
  → SimulationState.paths
  → ThreePathRenderer.sync() / PhaserPathRenderer.sync()
```

`PhaserPathRenderer` already respects `path.thickness` via `g.lineStyle(...)`.

`ThreePathRenderer` sets `LineBasicMaterial.linewidth`, but this has **no
visible effect** in WebGL. The WebGL spec only guarantees `lineWidth = 1`;
most browsers and GPU drivers silently clamp any other value. This is a
well-known Three.js limitation.

The thickness UI slider was removed from the panel until this migration is
complete. The data model (`Path2D.thickness`, `PathVisualConfig.thickness`,
`setVisualConfig`) is retained so no capability-layer changes are needed.

## Goal

Replace `THREE.Line` + `THREE.LineBasicMaterial` with the Three.js fat-line
pipeline so `path.thickness` produces a visible change in the WebGL viewport.

## Prompt

Migrate `ThreePathRenderer` from `THREE.Line` / `THREE.LineBasicMaterial` to
the Three.js fat-line pipeline (`Line2` / `LineMaterial` / `LineGeometry`)
so that `path.thickness` produces a visible width change in the WebGL
viewport.

### Requirements

1. Replace the current rendering objects:
   - `THREE.Line` → `Line2` (from `three/examples/jsm/lines/Line2`)
   - `THREE.LineBasicMaterial` → `LineMaterial` (from `three/examples/jsm/lines/LineMaterial`)
   - `THREE.BufferGeometry` → `LineGeometry` (from `three/examples/jsm/lines/LineGeometry`)

2. `LineMaterial` requires a `resolution` uniform set to the current canvas
   size (`renderer.getSize()`). Update the material's `resolution` on each
   frame or on resize.

3. Use `path.thickness` (in pixels) as `LineMaterial.linewidth`. Fall back to
   `2` when `path.thickness` is absent.

4. Keep `path.color` support — `LineMaterial` accepts a `color` property the
   same way `LineBasicMaterial` does.

5. Keep the existing size-aware buffer management strategy. `LineGeometry`
   uses `setPositions(Float32Array)` instead of a raw position attribute.
   When the point count changes, create a new `LineGeometry`; when it stays
   the same, call `setPositions` in place.

6. Keep all existing debug instrumentation (`dlog`, `throttledLog`, `dwarn`,
   `derror`, `debugState`) — just adapt the attribute names if needed.

7. Keep `geometry.computeBoundingSphere()` after updates.

8. Do NOT change `PhaserPathRenderer` — it already works.

9. Do NOT change the data model (`Path2D`, `PathVisualConfig`,
   `RenderableTopicCapability`).

10. After the migration, re-add the thickness slider to `Ros2TopicsPanel`:
    - Row label: "Thickness"
    - `<input type="range">` min=1 max=10 step=0.5
    - Numeric value display
    - Calls `renderable?.setVisualConfig?.(topic.name, { thickness })`
    - Re-add the CSS classes:
      `.ros2-topics-thickness-group`
      `.ros2-topics-thickness-slider`
      `.ros2-topics-thickness-value`

### Files to modify

- `src/ui/renderers/three/objects/ThreePathRenderer.ts` — main migration
- `src/ui/Ros2TopicsPanel.tsx` — re-add thickness slider
- `src/app/app.css` — re-add thickness CSS

### Verification

- `npx tsc --noEmit` passes
- `npx vitest run` — all tests pass
- Visually confirm that changing thickness in the UI produces a visible line
  width change in the Three.js viewport
- Confirm `path.color` still works after the migration

### References

- Three.js fat lines example: https://threejs.org/examples/#webgl_lines_fat
- `Line2` source: `three/examples/jsm/lines/Line2.js`
- `LineMaterial` source: `three/examples/jsm/lines/LineMaterial.js`
- `LineGeometry` source: `three/examples/jsm/lines/LineGeometry.js`


now help me to implement this, in the UI just allow a maximun of thikness of 5