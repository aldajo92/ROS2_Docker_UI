import * as THREE from 'three'
import type { SimulationState } from '../../../../simulation/core/SimulationState'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeRenderObjectRegistry } from '../core/ThreeRenderObjectRegistry'
import { simPoint2DToThree } from '../mapping/simToThree'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { Point2D } from '../../../../math/geometry/Point2D'
import {
  DEFAULT_THREE_TRAIL_CONFIG,
  type ThreeTrailConfig,
} from '../config/ThreeRendererConfig'

/**
 * Visual-only breadcrumb trail for vehicles. Trail points live ONLY
 * in this renderer — never on the entity — so swapping renderers or
 * disabling visuals doesn't leak memory in the simulation core.
 *
 * Sampling modes (see `TrailSamplingMode`):
 *   - `pointCount` (default): append every sync, keep the last
 *     `maxPoints`. A stopped vehicle still piles up samples up to
 *     the cap. `minDistance > 0` makes appends contingent on motion.
 *   - `timeWindow`: append at most every `minSampleDtSec` sim seconds
 *     and prune samples older than `currentSimTime - timeWindowSec`.
 *     `maxPoints` still acts as a hard safety cap.
 *
 * Both modes use sim time from `state.clock.time()` — never wall-clock —
 * so a paused engine produces a paused trail.
 *
 * Geometry strategy:
 *   - Each trail line owns a pre-allocated `Float32BufferAttribute`
 *     of size `maxPoints * 3`. We write into that buffer in place and
 *     advance `drawRange` to the visible point count. This is the
 *     canonical Three.js sliding-window pattern; calling
 *     `setFromPoints` repeatedly with a growing array is NOT a
 *     substitute — once the position attribute is allocated,
 *     `setFromPoints` clips additional points to the original
 *     capacity (see `BufferGeometry.setFromPoints` in three r150+).
 *   - Sim-frame `Point2D`s are stored alongside the GPU attribute so
 *     a `height` change re-projects the existing buffer without
 *     waiting for a new tick.
 *
 * Behavioral notes:
 *   - `enabled === false` hides every line and stops sampling. The
 *     internal buffer is preserved so toggling back on resumes the
 *     existing trail; only `clear()` drops history.
 *   - Materials are per-line so disposing one line on entity removal
 *     doesn't kill resources still in use by other trails.
 *
 * The renderer NEVER mutates `SimulationState`. It only reads
 * `vehicle.pose.position` and `state.clock.time()`.
 */
export class ThreeTrailRenderer {
  private readonly context: ThreeSceneContext
  private config: ThreeTrailConfig
  private readonly registry = new ThreeRenderObjectRegistry<THREE.Line>()
  /** Per-vehicle timestamped breadcrumb buffer. We keep the sim-frame
   *  `Point2D` alongside the timestamp so a `height` change can
   *  re-project the buffer without waiting for a new sync, and so
   *  `timeWindow` pruning has the data it needs. */
  private readonly samples = new Map<string, TrailSample[]>()

  constructor(
    context: ThreeSceneContext,
    config: ThreeTrailConfig = DEFAULT_THREE_TRAIL_CONFIG,
  ) {
    this.context = context
    this.config = sanitizeConfig({ ...DEFAULT_THREE_TRAIL_CONFIG, ...config })
  }

  sync(state: SimulationState): void {
    const vehicles = state.entities.byType<VehicleEntity>('vehicle')
    const liveIds = new Set<string>()
    const now = state.clock.time()

    for (const vehicle of vehicles) {
      liveIds.add(vehicle.id)
      const buffer = this.getOrCreateBuffer(vehicle.id)
      const line = this.getOrCreateLine(vehicle.id)

      if (this.config.enabled) {
        this.appendIfAllowed(buffer, vehicle.pose.position, now)
        this.pruneBuffer(buffer, now)
        this.repaintLine(line, buffer)
      }
      line.visible = this.config.enabled
    }

    for (const [id, line] of [...this.registry.entries()]) {
      if (!liveIds.has(id)) {
        this.disposeLine(line)
        this.registry.delete(id)
        this.samples.delete(id)
      }
    }
  }

  /** Wipe every per-vehicle history but keep lines + materials around
   *  so the next sync can reuse them. The visible draw range is
   *  reset to zero so the previous trail disappears immediately,
   *  even if `enabled === false`. */
  clear(): void {
    for (const buffer of this.samples.values()) buffer.length = 0
    for (const line of this.registry.values()) {
      ;(line.geometry as THREE.BufferGeometry).setDrawRange(0, 0)
    }
  }

  dispose(): void {
    for (const line of this.registry.values()) this.disposeLine(line)
    this.registry.clear()
    this.samples.clear()
  }

  /**
   * Apply a partial config update. Visual properties (color, opacity,
   * lineWidth, height) take effect immediately on the next paint;
   * `enabled = false` hides existing lines without dropping their
   * buffers; changing `maxPoints` reallocates each line's GPU buffer
   * and trims the in-memory history if it shrinks. Switching modes
   * does NOT clear the existing buffer — it just changes how future
   * samples are gated/pruned and immediately repaints.
   */
  setConfig(partial: Partial<ThreeTrailConfig>): void {
    const next = sanitizeConfig({ ...this.config, ...partial })
    const prev = this.config
    this.config = next

    if (
      next.color !== prev.color ||
      next.opacity !== prev.opacity ||
      next.lineWidth !== prev.lineWidth
    ) {
      for (const line of this.registry.values()) {
        applyMaterialConfig(line.material as THREE.LineBasicMaterial, next)
      }
    }

    if (next.maxPoints !== prev.maxPoints) {
      for (const buffer of this.samples.values()) this.trimToMaxPoints(buffer)
      for (const line of this.registry.values()) {
        this.allocateGeometry(line, next.maxPoints)
      }
    }

    // Repaint each line so the new height / max-points / visibility
    // takes effect even if the sim is paused.
    for (const [id, line] of this.registry.entries()) {
      const buffer = this.samples.get(id) ?? []
      this.repaintLine(line, buffer)
      line.visible = next.enabled
    }
  }

  setEnabled(enabled: boolean): void {
    this.setConfig({ enabled })
  }

  getConfig(): ThreeTrailConfig {
    return this.config
  }

  private getOrCreateBuffer(id: string): TrailSample[] {
    let buffer = this.samples.get(id)
    if (!buffer) {
      buffer = []
      this.samples.set(id, buffer)
    }
    return buffer
  }

  private getOrCreateLine(id: string): THREE.Line {
    let line = this.registry.get(id)
    if (!line) {
      line = this.createTrailLine()
      this.registry.set(id, line)
      this.context.scene.add(line)
    }
    return line
  }

  /**
   * Decide whether to append a new sample. Both modes share the
   * "first sample is always appended" + `minDistance` gates; the
   * `timeWindow` mode adds a `minSampleDtSec` gate on top.
   */
  private appendIfAllowed(
    buffer: TrailSample[],
    position: Point2D,
    timeSec: number,
  ): void {
    if (buffer.length === 0) {
      buffer.push({ timeSec, point: Point2D.of(position.x, position.y) })
      return
    }

    const last = buffer[buffer.length - 1]

    if (this.config.minDistance > 0) {
      const dx = position.x - last.point.x
      const dy = position.y - last.point.y
      const distSq = dx * dx + dy * dy
      const minSq = this.config.minDistance * this.config.minDistance
      if (distSq < minSq) return
    }

    if (
      this.config.samplingMode === 'timeWindow' &&
      this.config.minSampleDtSec > 0
    ) {
      if (timeSec - last.timeSec < this.config.minSampleDtSec) return
    }

    buffer.push({ timeSec, point: Point2D.of(position.x, position.y) })
  }

  /**
   * Mode-specific pruning. `timeWindow` drops anything outside the
   * window first, then both modes enforce the `maxPoints` safety cap.
   */
  private pruneBuffer(buffer: TrailSample[], now: number): void {
    if (this.config.samplingMode === 'timeWindow') {
      const cutoff = now - this.config.timeWindowSec
      // Buffers grow append-only with monotonically increasing
      // timestamps, so a single linear scan from the front finds the
      // first surviving index — no binary search needed.
      let drop = 0
      while (drop < buffer.length && buffer[drop].timeSec < cutoff) drop++
      if (drop > 0) buffer.splice(0, drop)
    }
    this.trimToMaxPoints(buffer)
  }

  private trimToMaxPoints(buffer: TrailSample[]): void {
    if (buffer.length > this.config.maxPoints) {
      buffer.splice(0, buffer.length - this.config.maxPoints)
    }
  }

  private repaintLine(line: THREE.Line, buffer: TrailSample[]): void {
    const geometry = line.geometry as THREE.BufferGeometry
    const attribute = geometry.attributes.position as THREE.BufferAttribute
    const count = Math.min(buffer.length, this.config.maxPoints)
    for (let i = 0; i < count; i++) {
      const v = simPoint2DToThree(buffer[i].point, this.config.height)
      attribute.setXYZ(i, v.x, v.y, v.z)
    }
    attribute.needsUpdate = true
    geometry.setDrawRange(0, count)
  }

  private createTrailLine(): THREE.Line {
    const geometry = new THREE.BufferGeometry()
    const material = new THREE.LineBasicMaterial()
    applyMaterialConfig(material, this.config)
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    line.name = 'vehicle-trail'
    line.visible = this.config.enabled
    this.allocateGeometry(line, this.config.maxPoints)
    return line
  }

  /**
   * (Re)allocate the position attribute to exactly `maxPoints * 3`
   * floats. Called on construction and whenever `maxPoints` changes
   * — never per frame. The previous attribute is disposed to avoid
   * leaking GPU memory.
   */
  private allocateGeometry(line: THREE.Line, maxPoints: number): void {
    const geometry = line.geometry as THREE.BufferGeometry
    const old = geometry.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined
    if (old) {
      // The replacement below detaches `old` from the geometry; we
      // dispose it explicitly so the GPU buffer is freed.
      ;(old as unknown as { dispose?: () => void }).dispose?.()
    }
    const attribute = new THREE.Float32BufferAttribute(
      new Float32Array(maxPoints * 3),
      3,
    )
    attribute.setUsage(THREE.DynamicDrawUsage)
    geometry.setAttribute('position', attribute)
    geometry.setDrawRange(0, 0)
  }

  /** Per-line teardown that disposes only this line's resources —
   *  important because materials/geometries are NOT shared across
   *  lines, so a single removal must not touch the others. */
  private disposeLine(line: THREE.Line): void {
    this.context.scene.remove(line)
    const geometry = line.geometry as THREE.BufferGeometry
    geometry.dispose()
    const material = line.material as THREE.Material
    material.dispose()
  }
}

/** Internal: sim-frame breadcrumb sample. We keep the `Point2D` so a
 *  `height` change can re-project without waiting for a new tick, and
 *  the `timeSec` so `timeWindow` mode can prune by sim time. */
interface TrailSample {
  timeSec: number
  point: Point2D
}

function applyMaterialConfig(
  material: THREE.LineBasicMaterial,
  config: ThreeTrailConfig,
): void {
  material.color.set(config.color)
  material.opacity = config.opacity
  material.transparent = config.opacity < 1
  // Note: `linewidth` is ignored by most desktop WebGL impls — see
  // `ThreeTrailConfig.lineWidth` for the rationale.
  material.linewidth = config.lineWidth
  material.needsUpdate = true
}

function sanitizeConfig(config: ThreeTrailConfig): ThreeTrailConfig {
  return {
    enabled: config.enabled,
    samplingMode:
      config.samplingMode === 'timeWindow' ? 'timeWindow' : 'pointCount',
    maxPoints: Math.max(2, Math.floor(config.maxPoints)),
    // Must be strictly > 0 so a 0-second window doesn't drop every
    // sample on the same tick it's appended. Snap to a small floor.
    timeWindowSec: Number.isFinite(config.timeWindowSec)
      ? Math.max(0.001, config.timeWindowSec)
      : 10,
    minSampleDtSec: Number.isFinite(config.minSampleDtSec)
      ? Math.max(0, config.minSampleDtSec)
      : 0,
    minDistance: Math.max(0, config.minDistance),
    height: Math.max(0, config.height),
    color: config.color,
    opacity: clamp01(config.opacity),
    lineWidth: Math.max(1, config.lineWidth),
  }
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 1
  if (x < 0) return 0
  if (x > 1) return 1
  return x
}
