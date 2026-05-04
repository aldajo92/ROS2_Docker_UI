import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EntityManager } from '../../../../simulation/core/EntityManager'
import { SimulationClock } from '../../../../simulation/core/SimulationClock'
import { SimulationState } from '../../../../simulation/core/SimulationState'
import { TypedEventBus } from '../../../../simulation/events/EventBus'
import type { SimulationEvents } from '../../../../simulation/events/SimulationEvents'
import { Logger } from '../../../../simulation/logging/Logger'
import type { PoseArray2D } from '../../../../simulation/poses/PoseArray2D'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreePoseArrayRenderer } from './ThreePoseArrayRenderer'

/**
 * Regression: `ThreePoseArrayRenderer` previously bypassed the central
 * sim→three mapping helpers and wrote raw `(pose.x, pose.y, height)`
 * into `arrow.position`, placing arrows on three's vertical X/Y plane
 * instead of on the horizontal ground plane. These tests pin the
 * correct mapping (`x → three.x`, `height → three.y`, `y → -three.z`,
 * `yaw → rotation.y`) so that regression cannot reappear.
 */

function createState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

function createContext(scene: THREE.Scene): ThreeSceneContext {
  return {
    scene,
    camera: new THREE.PerspectiveCamera(),
    renderer: {} as THREE.WebGLRenderer,
    container: {} as HTMLElement,
    requestRender: () => {},
  }
}

function makePoseArray(
  id: string,
  poses: PoseArray2D['poses'],
): PoseArray2D {
  return { id, poses }
}

describe('ThreePoseArrayRenderer', () => {
  let state: SimulationState
  let scene: THREE.Scene
  let renderer: ThreePoseArrayRenderer

  beforeEach(() => {
    state = createState()
    scene = new THREE.Scene()
    renderer = new ThreePoseArrayRenderer(createContext(scene))
  })

  it('creates one group per pose array containing one arrow per pose', () => {
    state.poseArrays.upsert(
      makePoseArray('nav/plan', [
        { x: 1, y: 2, yaw: 0 },
        { x: 3, y: 4, yaw: Math.PI / 2 },
      ]),
    )

    renderer.sync(state)

    const group = scene.getObjectByName('poseArray:nav/plan')
    expect(group).toBeInstanceOf(THREE.Group)
    expect(group?.children).toHaveLength(2)
  })

  it('places arrows on the horizontal ground plane via simPoint2DToThree', () => {
    // sim (x=2, y=3) must land at three (2, height, -3) — ground plane,
    // not at (2, 3, height) as the pre-fix renderer would have done.
    state.poseArrays.upsert(
      makePoseArray('nav/plan', [{ x: 2, y: 3, yaw: 0 }]),
    )

    renderer.sync(state)

    const group = scene.getObjectByName('poseArray:nav/plan') as THREE.Group
    const arrow = group.children[0]
    expect(arrow.position.x).toBeCloseTo(2, 9)
    // three.y holds the ground-plane height, never sim Y.
    expect(arrow.position.y).toBeGreaterThan(0)
    expect(arrow.position.y).toBeLessThan(1)
    expect(arrow.position.z).toBeCloseTo(-3, 9)
  })

  it('drives yaw through rotation.y (not rotation.z) per the sim→three mapping', () => {
    // Yaw=+π/2 in sim rotates heading from +X to +Y, which in three is
    // +X to -Z — a rotation *around* three +Y. `rotation.z` must stay 0.
    state.poseArrays.upsert(
      makePoseArray('nav/plan', [{ x: 0, y: 0, yaw: Math.PI / 2 }]),
    )

    renderer.sync(state)

    const group = scene.getObjectByName('poseArray:nav/plan') as THREE.Group
    const arrow = group.children[0]
    expect(arrow.rotation.y).toBeCloseTo(Math.PI / 2, 9)
    expect(arrow.rotation.x).toBeCloseTo(0, 9)
    expect(arrow.rotation.z).toBeCloseTo(0, 9)

    // Confirm the rendered heading lands on the ground plane (three -Z):
    // the arrow primitive points along its local +X, so applying the
    // arrow's Euler to (1,0,0) should yield (~0, 0, -1).
    const heading = new THREE.Vector3(1, 0, 0).applyEuler(arrow.rotation)
    expect(heading.x).toBeCloseTo(0, 9)
    expect(heading.y).toBeCloseTo(0, 9)
    expect(heading.z).toBeCloseTo(-1, 9)
  })

  it('removes groups for pose arrays that disappear from state', () => {
    state.poseArrays.upsert(
      makePoseArray('a', [{ x: 0, y: 0, yaw: 0 }]),
    )
    state.poseArrays.upsert(
      makePoseArray('b', [{ x: 1, y: 1, yaw: 0 }]),
    )
    renderer.sync(state)
    expect(scene.getObjectByName('poseArray:a')).toBeTruthy()
    expect(scene.getObjectByName('poseArray:b')).toBeTruthy()

    state.poseArrays.remove('a')
    renderer.sync(state)
    expect(scene.getObjectByName('poseArray:a')).toBeFalsy()
    expect(scene.getObjectByName('poseArray:b')).toBeTruthy()
  })

  it('disposes all groups on dispose()', () => {
    state.poseArrays.upsert(
      makePoseArray('nav/plan', [{ x: 0, y: 0, yaw: 0 }]),
    )
    renderer.sync(state)
    expect(scene.getObjectByName('poseArray:nav/plan')).toBeTruthy()

    renderer.dispose()
    expect(scene.getObjectByName('poseArray:nav/plan')).toBeFalsy()
  })

  it('does not mutate the PoseArray2D it reads from state', () => {
    const original: PoseArray2D = makePoseArray('nav/plan', [
      { x: 1, y: 2, yaw: 0.3 },
    ])
    state.poseArrays.upsert(original)
    const snapshot = JSON.parse(JSON.stringify(original))

    renderer.sync(state)

    expect(state.poseArrays.get('nav/plan')).toEqual(snapshot)
  })
})
