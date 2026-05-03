import * as THREE from 'three'
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
 * Threshold above which the renderer warns that a path is suspiciously
 * large. This is *only* a diagnostic — the renderer will still try to
 * draw paths longer than this. Tune if needed; the goal is to surface
 * accidental unbounded growth in dynamic-path publishers.
 */
const LARGE_PATH_WARN_POINTS = 5_000

/**
 * Per-line accumulators kept exclusively for instrumentation. None of
 * these values feed back into rendering decisions.
 */
interface LineDebugState {
  syncCount: number
  lastPointCount: number
  lastVertexCount: number
  warnedLarge: boolean
  /** Tracks whether `setFromPoints` reallocated the position attribute
   *  on the previous sync (heuristic: vertex count crossed previous
   *  capacity). */
  lastPositionAttributeUuid: string | null
}

export class ThreePathRenderer {
  private readonly context: ThreeSceneContext
  private readonly lines = new Map<string, THREE.Line>()
  private readonly debugState = new Map<string, LineDebugState>()

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

    for (const path of paths) {
      let line = this.lines.get(path.id)
      let created = false
      if (!line) {
        try {
          const geometry = new THREE.BufferGeometry()
          const material = new THREE.LineBasicMaterial({ color: PATH_COLOR })
          line = new THREE.Line(geometry, material)
          line.frustumCulled = false
          line.name = `path:${path.id}`
          this.lines.set(path.id, line)
          this.debugState.set(path.id, {
            syncCount: 0,
            lastPointCount: 0,
            lastVertexCount: 0,
            warnedLarge: false,
            lastPositionAttributeUuid: null,
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
            `failed to create Line for id="${path.id}":`,
            err,
          )
          continue
        }
      }

      const debugState = this.debugState.get(path.id)

      try {
        const projected = path.points.map((p) =>
          simPoint2DToThree(Point2D.of(p.x, p.y), PATH_HEIGHT),
        )
        const geometry = line.geometry as THREE.BufferGeometry

        // Capture the previous position-attribute identity so we can
        // detect reallocations (which create GPU buffer churn).
        const prevPosAttr = geometry.getAttribute('position') as
          | THREE.BufferAttribute
          | undefined
        const prevPosUuid = (prevPosAttr as unknown as { uuid?: string })
          ?.uuid ?? null

        // Size-aware buffer update.
        //
        // We deliberately do NOT use `BufferGeometry.setFromPoints(...)`
        // here. In Three.js r0.184, `setFromPoints` only allocates a
        // new position attribute when none exists yet — on subsequent
        // calls it does an in-place fill bounded by the original
        // attribute's `count`. For dynamic ROS paths whose length
        // changes between messages, that means:
        //
        //   * new points > existing capacity → silently truncated
        //     (only a `console.warn`, easy to miss).
        //   * new points < existing capacity → first N updated, the
        //     rest of the buffer keeps stale vertices from earlier
        //     frames.
        //
        // The captured `[ThreePath]` debug log made this visible:
        // `vertices` would lock to the FIRST message's point count
        // and never change, even as `points` swung between 6 and 31.
        //
        // The fix is straightforward: when the requested size does
        // not match the existing attribute, replace it with a freshly
        // allocated `BufferAttribute` of exactly the right size.
        // Otherwise mutate the existing buffer in place — that's the
        // hot path, GPU-friendly and zero-allocation.
        const targetCount = projected.length
        if (!prevPosAttr || prevPosAttr.count !== targetCount) {
          const positions = new Float32Array(targetCount * 3)
          for (let i = 0; i < targetCount; i++) {
            const p = projected[i]
            positions[i * 3] = p.x
            positions[i * 3 + 1] = p.y
            positions[i * 3 + 2] = p.z
          }
          geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(positions, 3),
          )
        } else {
          for (let i = 0; i < targetCount; i++) {
            const p = projected[i]
            prevPosAttr.setXYZ(i, p.x, p.y, p.z)
          }
          prevPosAttr.needsUpdate = true
        }
        // `setFromPoints` does this internally; we have to do it
        // explicitly when bypassing it. Required for frustum culling
        // and for some `Raycaster` paths.
        geometry.computeBoundingSphere()

        const posAttr = geometry.getAttribute('position') as
          | THREE.BufferAttribute
          | undefined
        const vertexCount = posAttr?.count ?? 0
        const newPosUuid = (posAttr as unknown as { uuid?: string })?.uuid
          ?? null
        const reallocated =
          prevPosUuid !== null && newPosUuid !== null && prevPosUuid !== newPosUuid

        if (debugState) {
          const sizeChanged = projected.length !== debugState.lastPointCount
          const action = created
            ? 'created'
            : sizeChanged
              ? projected.length > debugState.lastPointCount
                ? 'appended'
                : 'shrunk'
              : 'replaced'

          // Throttled per-path summary so high-rate publishers don't
          // flood the console. Logs growth, exact action, and the GL
          // attribute identity so we can spot reallocation churn.
          throttledLog('ThreePath', `sync:${path.id}`, () => [
            `id="${path.id}"`,
            `points=${projected.length}`,
            `vertices=${vertexCount}`,
            `action=${action}`,
            `posAttrRealloc=${reallocated ? 'yes' : 'no'}`,
            `geomAttrUndef=${posAttr === undefined ? 'yes' : 'no'}`,
            `materialUndef=${line.material === undefined ? 'yes' : 'no'}`,
            `syncs=${debugState.syncCount + 1}`,
            `growthSinceLast=${projected.length - debugState.lastPointCount}`,
          ])

          // Defensive sanity checks. Logged unconditionally (gated by
          // dwarn's flag check) — we want to know about these even
          // when the throttled summary is silent.
          if (posAttr === undefined) {
            dwarn(
              'ThreePath',
              `id="${path.id}" position attribute is undefined after setFromPoints`,
            )
          }
          if (line.material === undefined) {
            dwarn(
              'ThreePath',
              `id="${path.id}" material is undefined`,
            )
          }
          if (
            !debugState.warnedLarge &&
            projected.length >= LARGE_PATH_WARN_POINTS
          ) {
            debugState.warnedLarge = true
            dwarn(
              'ThreePath',
              `id="${path.id}" exceeded ${LARGE_PATH_WARN_POINTS} points` +
                ` (now ${projected.length}). High-frequency growth can` +
                ` cause GL buffer churn and reduce frame rate.`,
            )
          } else if (
            debugState.warnedLarge &&
            projected.length < LARGE_PATH_WARN_POINTS
          ) {
            // Reset so a later regrowth re-warns once.
            debugState.warnedLarge = false
          }

          debugState.syncCount += 1
          debugState.lastPointCount = projected.length
          debugState.lastVertexCount = vertexCount
          debugState.lastPositionAttributeUuid = newPosUuid
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
  }
}
