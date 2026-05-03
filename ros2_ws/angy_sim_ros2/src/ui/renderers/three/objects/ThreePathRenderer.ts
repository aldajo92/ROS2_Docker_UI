import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { Point2D } from '../../../../math/geometry/Point2D'
import {
  derror,
  dlog,
  dwarn,
  throttledLog,
} from '../../../../debug/RenderDebug'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { simPoint2DToThree } from '../mapping/simToThree'
import { PATH_COLOR } from '../config/VisualStyle'

const PATH_HEIGHT = 0.06

/**
 * Default linewidth (in CSS pixels) when {@link Path2D.thickness} is
 * absent. The previous WebGL `LineBasicMaterial.linewidth` was a
 * documented no-op (always rendered at 1px), so this is the first
 * value that produces a visibly nonzero line in the migrated pipeline.
 */
const DEFAULT_LINEWIDTH = 2

/**
 * Threshold above which the renderer warns that a path is suspiciously
 * large. This is *only* a diagnostic — the renderer will still try to
 * draw paths longer than this. Tune if needed; the goal is to surface
 * accidental unbounded growth in dynamic-path publishers.
 */
const LARGE_PATH_WARN_POINTS = 5_000

/**
 * The DefinitelyTyped `LineMaterial` declarations ship `color`,
 * `resolution`, `worldUnits`, and the dash properties — but omit the
 * `linewidth` accessor that is the entire reason for switching to the
 * fat-line pipeline. The runtime accessor is always present (and
 * documented in the upstream JSDoc); we narrow once via this
 * intersection so the rest of the file stays cast-free.
 */
type LineMaterialWithWidth = LineMaterial & { linewidth: number }

/**
 * Per-line accumulators kept exclusively for instrumentation. None of
 * these values feed back into rendering decisions.
 */
interface LineDebugState {
  syncCount: number
  lastPointCount: number
  warnedLarge: boolean
  /** UUID of the LineGeometry currently attached to the line. Used to
   *  detect geometry swaps (which create GPU buffer churn). */
  lastGeometryUuid: string
}

export class ThreePathRenderer {
  private readonly context: ThreeSceneContext
  private readonly lines = new Map<string, Line2>()
  private readonly debugState = new Map<string, LineDebugState>()
  private readonly lastAppliedColor = new Map<string, string>()
  private readonly lastAppliedThickness = new Map<string, number>()
  /** Reusable Vector2 for `renderer.getSize(...)` so we don't allocate
   *  one per sync. */
  private readonly resolutionScratch = new THREE.Vector2()

  constructor(context: ThreeSceneContext) {
    this.context = context
  }

  sync(state: SimulationState): void {
    const paths = state.paths.toArray()
    const activeIds = new Set(paths.map((p) => p.id))

    for (const id of [...this.lines.keys()]) {
      if (!activeIds.has(id)) {
        dlog('ThreePath', `clear id="${id}" (path removed from state)`)
        this.removeLine(id)
      }
    }

    // Read the current canvas size once per sync — every line shares
    // the same viewport, and `LineMaterial.resolution` must track it
    // to keep pixel-space line width correct across resizes (the user
    // can resize the panel without firing a window `resize`).
    const size = this.context.renderer.getSize(this.resolutionScratch)

    for (const path of paths) {
      let line = this.lines.get(path.id)
      let created = false
      if (!line) {
        try {
          const geometry = new LineGeometry()
          const initialColor = path.color
            ? new THREE.Color(path.color)
            : new THREE.Color(PATH_COLOR)
          const initialThickness = path.thickness ?? DEFAULT_LINEWIDTH
          // The official typings for `LineMaterialParameters` omit
          // `linewidth`, but the underlying `ShaderMaterial.setValues`
          // honors it. We assign through `LineMaterialWithWidth`
          // immediately after construction to keep the call type-safe.
          const material = new LineMaterial({
            color: initialColor,
            resolution: new THREE.Vector2(size.x, size.y),
          })
          ;(material as LineMaterialWithWidth).linewidth = initialThickness
          line = new Line2(geometry, material)
          line.frustumCulled = false
          line.name = `path:${path.id}`
          this.lines.set(path.id, line)
          this.lastAppliedColor.set(path.id, path.color ?? '')
          this.lastAppliedThickness.set(path.id, initialThickness)
          this.debugState.set(path.id, {
            syncCount: 0,
            lastPointCount: 0,
            warnedLarge: false,
            lastGeometryUuid: geometry.uuid,
          })
          this.context.scene.add(line)
          created = true
          dlog(
            'ThreePath',
            `create id="${path.id}" name="${line.name}" sceneChildren=${this.context.scene.children.length}`,
          )
        } catch (err) {
          derror(
            'ThreePath',
            `failed to create Line2 for id="${path.id}":`,
            err,
          )
          continue
        }
      }

      const material = line.material as LineMaterialWithWidth

      // `resolution` must be refreshed every frame: a `Vector2` shared
      // across syncs is fine, but if we don't write the current width
      // and height the shader will draw at last-known resolution and
      // misjudge pixel widths after a resize.
      material.resolution.set(size.x, size.y)

      // Color update — only push a new value when the configured color
      // actually changed, to avoid redundant uniform writes and Color
      // reconstructions every frame.
      const currentColorKey = path.color ?? ''
      if (this.lastAppliedColor.get(path.id) !== currentColorKey) {
        material.color.set(path.color ?? PATH_COLOR)
        this.lastAppliedColor.set(path.id, currentColorKey)
      }

      // Linewidth update — same change-detection pattern. `linewidth`
      // is in CSS pixels (because `worldUnits` stays at its default
      // `false`), so it maps 1:1 onto the UI thickness slider.
      const targetThickness = path.thickness ?? DEFAULT_LINEWIDTH
      if (this.lastAppliedThickness.get(path.id) !== targetThickness) {
        material.linewidth = targetThickness
        this.lastAppliedThickness.set(path.id, targetThickness)
      }

      const debugState = this.debugState.get(path.id)
      const prevGeomUuid = (line.geometry as LineGeometry).uuid

      try {
        const projected = path.points.map((p) =>
          simPoint2DToThree(Point2D.of(p.x, p.y), PATH_HEIGHT),
        )
        const targetCount = projected.length
        const sizeChanged =
          debugState !== undefined &&
          targetCount !== debugState.lastPointCount

        // Size-aware buffer management for the fat-line pipeline.
        //
        // `LineGeometry.setPositions(...)` always rebuilds the
        // underlying `InstancedInterleavedBuffer` from the input
        // array, so the truncation/leakage trap that bit the previous
        // `BufferGeometry`-based renderer doesn't apply here. The
        // remaining choice is whether to swap the entire LineGeometry
        // wrapper (forces a fresh `boundingSphere`, drops any cached
        // attribute identities the GL backend may keep) or to call
        // setPositions in place on the existing one.
        //
        // Spec says: when the point count changes, swap; otherwise
        // mutate. That keeps the Line2 object identity stable on the
        // hot path (so scene-graph subscribers and any user-attached
        // refs survive), and only churns geometry when the publisher
        // legitimately resized the path.
        if (targetCount === 0) {
          // `LineGeometry.setPositions` rejects empty input
          // (negative-size Float32Array). Skip the call and zero the
          // instance count so no segments are drawn this frame.
          ;(line.geometry as LineGeometry).instanceCount = 0
        } else if (sizeChanged && !created) {
          const positions = new Float32Array(targetCount * 3)
          for (let i = 0; i < targetCount; i++) {
            const p = projected[i]
            positions[i * 3] = p.x
            positions[i * 3 + 1] = p.y
            positions[i * 3 + 2] = p.z
          }
          const oldGeometry = line.geometry as LineGeometry
          const fresh = new LineGeometry()
          fresh.setPositions(positions)
          fresh.computeBoundingSphere()
          line.geometry = fresh
          oldGeometry.dispose()
        } else {
          const geometry = line.geometry as LineGeometry
          const positions = new Float32Array(targetCount * 3)
          for (let i = 0; i < targetCount; i++) {
            const p = projected[i]
            positions[i * 3] = p.x
            positions[i * 3 + 1] = p.y
            positions[i * 3 + 2] = p.z
          }
          geometry.setPositions(positions)
          geometry.computeBoundingSphere()
        }

        const newGeomUuid = (line.geometry as LineGeometry).uuid
        const reallocated = prevGeomUuid !== newGeomUuid

        if (debugState) {
          const action = created
            ? 'created'
            : sizeChanged
              ? targetCount > debugState.lastPointCount
                ? 'appended'
                : 'shrunk'
              : 'replaced'

          // Throttled per-path summary so high-rate publishers don't
          // flood the console. Logs growth, exact action, and the
          // geometry identity so we can spot reallocation churn.
          throttledLog('ThreePath', `sync:${path.id}`, () => [
            `id="${path.id}"`,
            `points=${targetCount}`,
            `vertices=${targetCount}`,
            `action=${action}`,
            `geomRealloc=${reallocated ? 'yes' : 'no'}`,
            `materialUndef=${line.material === undefined ? 'yes' : 'no'}`,
            `linewidth=${material.linewidth.toFixed(2)}`,
            `resolution=${size.x.toFixed(0)}x${size.y.toFixed(0)}`,
            `syncs=${debugState.syncCount + 1}`,
            `growthSinceLast=${targetCount - debugState.lastPointCount}`,
          ])

          // Defensive sanity check. Logged unconditionally (gated by
          // dwarn's flag check) — we want to know about these even
          // when the throttled summary is silent.
          if (line.material === undefined) {
            dwarn(
              'ThreePath',
              `id="${path.id}" material is undefined`,
            )
          }
          if (
            !debugState.warnedLarge &&
            targetCount >= LARGE_PATH_WARN_POINTS
          ) {
            debugState.warnedLarge = true
            dwarn(
              'ThreePath',
              `id="${path.id}" exceeded ${LARGE_PATH_WARN_POINTS} points` +
                ` (now ${targetCount}). High-frequency growth can` +
                ` cause GL buffer churn and reduce frame rate.`,
            )
          } else if (
            debugState.warnedLarge &&
            targetCount < LARGE_PATH_WARN_POINTS
          ) {
            // Reset so a later regrowth re-warns once.
            debugState.warnedLarge = false
          }

          debugState.syncCount += 1
          debugState.lastPointCount = targetCount
          debugState.lastGeometryUuid = newGeomUuid
        }
      } catch (err) {
        derror(
          'ThreePath',
          `sync failed for id="${path.id}" (points=${path.points.length}):`,
          err,
        )
        // Intentionally swallow: one bad geometry update must not
        // permanently kill the renderer or starve sibling paths in
        // this loop. The error is logged with a stack above.
      }
    }
  }

  dispose(): void {
    dlog('ThreePath', `dispose lines=${this.lines.size}`)
    for (const id of [...this.lines.keys()]) this.removeLine(id)
  }

  private removeLine(id: string): void {
    const line = this.lines.get(id)
    if (!line) return
    this.context.scene.remove(line)
    line.geometry.dispose()
    if (Array.isArray(line.material)) line.material.forEach((m) => m.dispose())
    else line.material.dispose()
    this.lines.delete(id)
    this.debugState.delete(id)
    this.lastAppliedColor.delete(id)
    this.lastAppliedThickness.delete(id)
  }
}
