import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ThreeTrailRenderer } from './ThreeTrailRenderer'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { DEFAULT_THREE_TRAIL_CONFIG } from '../config/ThreeRendererConfig'
import { SimulationState } from '../../../../simulation/core/SimulationState'
import { SimulationClock } from '../../../../simulation/core/SimulationClock'
import { EntityManager } from '../../../../simulation/core/EntityManager'
import { TypedEventBus } from '../../../../simulation/events/EventBus'
import type { SimulationEvents } from '../../../../simulation/events/SimulationEvents'
import { Logger } from '../../../../simulation/logging/Logger'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { Pose2D } from '../../../../math/geometry/Pose2D'

/**
 * The trail renderer's buffer + visibility behavior is decoupled
 * from WebGL: it appends sim-frame `Point2D`s and writes them to a
 * `THREE.BufferGeometry` via `setFromPoints`, both of which work in
 * jsdom. We mock just enough of `ThreeSceneContext` to exercise the
 * state machine.
 */

function makeContext(): ThreeSceneContext {
  return {
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    // The renderer is never actually invoked in these tests; we only
    // need an object that satisfies the type. Cast through `unknown`
    // to avoid pulling in WebGL.
    renderer: {} as unknown as THREE.WebGLRenderer,
    // The trail renderer never touches `container`; cast a stub so we
    // can run under vitest's `node` environment (no `document`).
    container: {} as unknown as HTMLElement,
    requestRender: () => {},
  }
}

function makeState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

function vehicleAt(id: string, x: number, y: number): VehicleEntity {
  return new VehicleEntity({ id, pose: Pose2D.of(x, y, 0) })
}

function moveVehicle(vehicle: VehicleEntity, x: number, y: number): void {
  // The entity owns the trail buffer keyed by `id`, so we move the
  // existing entity in place instead of removing + re-adding (which
  // would drop the buffer on the next sync).
  vehicle.pose = Pose2D.of(x, y, 0)
}

function pointCount(line: THREE.Line): number {
  // The geometry pre-allocates `maxPoints * 3` floats; the visible
  // portion is conveyed through the geometry's draw range, not the
  // attribute's `count`.
  return (line.geometry as THREE.BufferGeometry).drawRange.count
}

function findLine(scene: THREE.Scene): THREE.Line {
  const line = scene.children.find(
    (c): c is THREE.Line => (c as THREE.Object3D).name === 'vehicle-trail',
  )
  if (!line) throw new Error('expected a trail line in scene')
  return line
}

describe('ThreeTrailRenderer', () => {
  it('appends a point per vehicle on first sync', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      minDistance: 0,
    })
    const state = makeState()
    state.entities.add(vehicleAt('ego', 0, 0))

    renderer.sync(state)
    expect(pointCount(findLine(ctx.scene))).toBe(1)
  })

  it('respects minDistance: skips appends when motion is below threshold', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      minDistance: 0.5,
    })
    const state = makeState()
    const vehicle = vehicleAt('ego', 0, 0)
    state.entities.add(vehicle)

    renderer.sync(state)
    moveVehicle(vehicle, 0.1, 0)
    renderer.sync(state)
    expect(pointCount(findLine(ctx.scene))).toBe(1)

    moveVehicle(vehicle, 0.6, 0)
    renderer.sync(state)
    expect(pointCount(findLine(ctx.scene))).toBe(2)
  })

  it('trims the buffer to maxPoints', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      maxPoints: 3,
      minDistance: 0,
    })
    const state = makeState()
    const vehicle = vehicleAt('ego', 0, 0)
    state.entities.add(vehicle)

    for (let i = 0; i < 5; i++) {
      moveVehicle(vehicle, i, 0)
      renderer.sync(state)
    }
    expect(pointCount(findLine(ctx.scene))).toBe(3)
  })

  it('hides the line and stops sampling when enabled = false', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      minDistance: 0,
    })
    const state = makeState()
    const vehicle = vehicleAt('ego', 0, 0)
    state.entities.add(vehicle)
    renderer.sync(state)
    const initialCount = pointCount(findLine(ctx.scene))

    renderer.setEnabled(false)
    expect(findLine(ctx.scene).visible).toBe(false)

    moveVehicle(vehicle, 5, 0)
    renderer.sync(state)
    expect(pointCount(findLine(ctx.scene))).toBe(initialCount)

    renderer.setEnabled(true)
    expect(findLine(ctx.scene).visible).toBe(true)
    renderer.sync(state)
    expect(pointCount(findLine(ctx.scene))).toBeGreaterThan(initialCount)
  })

  it('clear() empties the geometry but keeps the line around', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      minDistance: 0,
    })
    const state = makeState()
    const vehicle = vehicleAt('ego', 0, 0)
    state.entities.add(vehicle)
    renderer.sync(state)
    moveVehicle(vehicle, 1, 0)
    renderer.sync(state)
    expect(pointCount(findLine(ctx.scene))).toBe(2)

    renderer.clear()
    expect(pointCount(findLine(ctx.scene))).toBe(0)
    // Line still in scene so the next append doesn't have to allocate.
    expect(findLine(ctx.scene)).toBeDefined()
  })

  it('removes the line when its vehicle disappears', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      minDistance: 0,
    })
    const state = makeState()
    state.entities.add(vehicleAt('ego', 0, 0))
    renderer.sync(state)
    expect(ctx.scene.children.some((c) => c.name === 'vehicle-trail')).toBe(
      true,
    )

    state.entities.remove('ego')
    renderer.sync(state)
    expect(ctx.scene.children.some((c) => c.name === 'vehicle-trail')).toBe(
      false,
    )
  })

  it('setConfig applies color, opacity, and transparent flag', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      minDistance: 0,
    })
    const state = makeState()
    state.entities.add(vehicleAt('ego', 0, 0))
    renderer.sync(state)

    renderer.setConfig({ color: '#00ff00', opacity: 0.5 })
    const material = findLine(ctx.scene)
      .material as THREE.LineBasicMaterial
    expect(material.color.getHexString()).toBe('00ff00')
    expect(material.opacity).toBeCloseTo(0.5)
    expect(material.transparent).toBe(true)

    renderer.setConfig({ opacity: 1 })
    expect(material.transparent).toBe(false)
  })

  it('setConfig clamps invalid input defensively', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, DEFAULT_THREE_TRAIL_CONFIG)
    renderer.setConfig({
      maxPoints: 0,
      timeWindowSec: -1,
      minSampleDtSec: -5,
      minDistance: -2,
      height: -3,
      opacity: 5,
      lineWidth: 0,
    })
    const cfg = renderer.getConfig()
    expect(cfg.maxPoints).toBe(2)
    // 0-second window would drop every sample on the same tick it's
    // appended, so the renderer snaps to a small positive floor.
    expect(cfg.timeWindowSec).toBeGreaterThan(0)
    expect(cfg.minSampleDtSec).toBe(0)
    expect(cfg.minDistance).toBe(0)
    expect(cfg.height).toBe(0)
    expect(cfg.opacity).toBe(1)
    expect(cfg.lineWidth).toBe(1)
  })

  it('setConfig({ maxPoints }) trims the existing buffer immediately', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      maxPoints: 10,
      minDistance: 0,
    })
    const state = makeState()
    const vehicle = vehicleAt('ego', 0, 0)
    state.entities.add(vehicle)
    for (let i = 0; i < 6; i++) {
      moveVehicle(vehicle, i, 0)
      renderer.sync(state)
    }
    expect(pointCount(findLine(ctx.scene))).toBe(6)

    renderer.setConfig({ maxPoints: 3 })
    expect(pointCount(findLine(ctx.scene))).toBe(3)
  })

  it('setConfig({ height }) re-projects existing points without a new sync', () => {
    const ctx = makeContext()
    const renderer = new ThreeTrailRenderer(ctx, {
      ...DEFAULT_THREE_TRAIL_CONFIG,
      height: 0,
      minDistance: 0,
    })
    const state = makeState()
    state.entities.add(vehicleAt('ego', 1, 2))
    renderer.sync(state)

    const positionAttr = (
      findLine(ctx.scene).geometry as THREE.BufferGeometry
    ).attributes.position as THREE.BufferAttribute
    // simPoint2DToThree puts the height on `y` (Three's vertical axis).
    expect(positionAttr.getY(0)).toBeCloseTo(0)

    renderer.setConfig({ height: 0.5 })
    expect(positionAttr.getY(0)).toBeCloseTo(0.5)
  })

  describe('pointCount mode', () => {
    it('appends every sync even when the vehicle is stopped (minDistance = 0)', () => {
      const ctx = makeContext()
      const renderer = new ThreeTrailRenderer(ctx, {
        ...DEFAULT_THREE_TRAIL_CONFIG,
        samplingMode: 'pointCount',
        minDistance: 0,
      })
      const state = makeState()
      state.entities.add(vehicleAt('ego', 0, 0))

      // Vehicle never moves; pointCount mode should still grow the
      // trail because there's no distance gate.
      for (let i = 0; i < 4; i++) {
        state.clock.tick(0.1)
        renderer.sync(state)
      }

      expect(pointCount(findLine(ctx.scene))).toBe(4)
    })
  })

  describe('timeWindow mode', () => {
    it('prunes samples older than currentSimTime - timeWindowSec', () => {
      const ctx = makeContext()
      const renderer = new ThreeTrailRenderer(ctx, {
        ...DEFAULT_THREE_TRAIL_CONFIG,
        samplingMode: 'timeWindow',
        timeWindowSec: 1.0,
        minSampleDtSec: 0,
        minDistance: 0,
        // High enough to confirm pruning isn't being driven by maxPoints.
        maxPoints: 100,
      })
      const state = makeState()
      const vehicle = vehicleAt('ego', 0, 0)
      state.entities.add(vehicle)

      // Drop 10 samples spaced 0.25 s apart over a 2.5 s span.
      for (let i = 0; i < 10; i++) {
        state.clock.tick(0.25)
        moveVehicle(vehicle, i * 0.1, 0)
        renderer.sync(state)
      }

      // sim time ≈ 2.5 s, window = 1.0 s → keep samples ≥ 1.5 s.
      // Appended at sim times ~0.25, 0.5, ..., 2.5 → samples at
      // 1.5, 1.75, 2.0, 2.25, 2.5 survive (5 samples).
      expect(pointCount(findLine(ctx.scene))).toBeLessThan(10)
      expect(pointCount(findLine(ctx.scene))).toBeGreaterThanOrEqual(4)
      expect(pointCount(findLine(ctx.scene))).toBeLessThanOrEqual(6)
    })

    it('throttles appends with minSampleDtSec', () => {
      const ctx = makeContext()
      const renderer = new ThreeTrailRenderer(ctx, {
        ...DEFAULT_THREE_TRAIL_CONFIG,
        samplingMode: 'timeWindow',
        timeWindowSec: 100,
        minSampleDtSec: 0.5,
        minDistance: 0,
      })
      const state = makeState()
      const vehicle = vehicleAt('ego', 0, 0)
      state.entities.add(vehicle)

      // First sync at t=0 always appends (no "last" sample).
      renderer.sync(state)
      // dt=0.2 → below threshold, skipped.
      state.clock.tick(0.2)
      moveVehicle(vehicle, 1, 0)
      renderer.sync(state)
      // Now at t=0.6, total dt=0.6 ≥ 0.5 → appended.
      state.clock.tick(0.4)
      moveVehicle(vehicle, 2, 0)
      renderer.sync(state)
      // Just 0.1 s later → below threshold, skipped.
      state.clock.tick(0.1)
      moveVehicle(vehicle, 3, 0)
      renderer.sync(state)
      // Another 0.5 s later → at-threshold, appended.
      state.clock.tick(0.5)
      moveVehicle(vehicle, 4, 0)
      renderer.sync(state)

      expect(pointCount(findLine(ctx.scene))).toBe(3)
    })

    it('still enforces maxPoints as a safety cap', () => {
      const ctx = makeContext()
      const renderer = new ThreeTrailRenderer(ctx, {
        ...DEFAULT_THREE_TRAIL_CONFIG,
        samplingMode: 'timeWindow',
        timeWindowSec: 1000, // effectively no time pruning
        minSampleDtSec: 0,
        minDistance: 0,
        maxPoints: 4,
      })
      const state = makeState()
      const vehicle = vehicleAt('ego', 0, 0)
      state.entities.add(vehicle)

      for (let i = 0; i < 10; i++) {
        state.clock.tick(0.1)
        moveVehicle(vehicle, i, 0)
        renderer.sync(state)
      }

      expect(pointCount(findLine(ctx.scene))).toBe(4)
    })

    it('switching modes preserves the existing buffer', () => {
      const ctx = makeContext()
      const renderer = new ThreeTrailRenderer(ctx, {
        ...DEFAULT_THREE_TRAIL_CONFIG,
        samplingMode: 'pointCount',
        minDistance: 0,
      })
      const state = makeState()
      const vehicle = vehicleAt('ego', 0, 0)
      state.entities.add(vehicle)
      for (let i = 0; i < 3; i++) {
        state.clock.tick(0.1)
        moveVehicle(vehicle, i, 0)
        renderer.sync(state)
      }
      expect(pointCount(findLine(ctx.scene))).toBe(3)

      // Flipping to timeWindow with a generous window must NOT drop
      // samples that landed before the switch — they all carry the
      // sim timestamp at which they were appended.
      renderer.setConfig({ samplingMode: 'timeWindow', timeWindowSec: 100 })
      expect(pointCount(findLine(ctx.scene))).toBe(3)
    })
  })
})
