import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { EntityManager } from '../../../../simulation/core/EntityManager'
import { SimulationClock } from '../../../../simulation/core/SimulationClock'
import { SimulationState } from '../../../../simulation/core/SimulationState'
import { TypedEventBus } from '../../../../simulation/events/EventBus'
import type { SimulationEvents } from '../../../../simulation/events/SimulationEvents'
import { Logger } from '../../../../simulation/logging/Logger'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeTrajectoryRenderer } from './ThreeTrajectoryRenderer'

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

describe('ThreeTrajectoryRenderer', () => {
  let state: SimulationState
  let scene: THREE.Scene
  let renderer: ThreeTrajectoryRenderer

  beforeEach(() => {
    state = createState()
    scene = new THREE.Scene()
    renderer = new ThreeTrajectoryRenderer(createContext(scene), {
      enabled: true,
      height: 0.25,
      color: '#ff5050',
      opacity: 0.8,
      lineWidth: 2,
    })
  })

  it('reads state.trajectories and creates one line per entity trajectory', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 1, y: 2 }, 10)
    state.trajectories.append('actor', { timeSec: 0, x: -1, y: 3 }, 10)

    renderer.sync(state)

    expect(scene.getObjectByName('trajectory:ego')).toBeInstanceOf(THREE.Line)
    expect(scene.getObjectByName('trajectory:actor')).toBeInstanceOf(THREE.Line)
  })

  it('removes stale lines when trajectories disappear', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('actor', { timeSec: 0, x: 1, y: 1 }, 10)
    renderer.sync(state)
    expect(scene.getObjectByName('trajectory:actor')).toBeTruthy()

    state.trajectories.clear('actor')
    renderer.sync(state)
    expect(scene.getObjectByName('trajectory:actor')).toBeFalsy()
    expect(scene.getObjectByName('trajectory:ego')).toBeTruthy()
  })

  it('maps sim samples through simToThree coordinates', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 2, y: 3 }, 10)
    renderer.sync(state)

    const line = scene.getObjectByName('trajectory:ego')
    expect(line).toBeTruthy()
    expect(line).toBeInstanceOf(THREE.Line)
    if (!(line instanceof THREE.Line)) {
      throw new TypeError('Expected THREE.Line for trajectory:ego')
    }
    const positions = line.geometry.getAttribute('position')
    expect(positions.array[0]).toBeCloseTo(2) // x -> x
    expect(positions.array[1]).toBeCloseTo(0.25) // configured height
    expect(positions.array[2]).toBeCloseTo(-3) // y -> -z
  })

  it('does not append samples or mutate trajectory data', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 1, y: 2, yaw: 0.3 }, 10)
    const before = state.trajectories.get('ego')
    renderer.sync(state)
    const after = state.trajectories.get('ego')

    expect(after).toEqual(before)
    expect(after?.samples).toHaveLength(1)
  })

  it('uses visible material defaults', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    renderer.sync(state)
    const line = scene.getObjectByName('trajectory:ego')
    expect(line).toBeInstanceOf(THREE.Line)
    if (!(line instanceof THREE.Line)) throw new TypeError('line expected')

    const material = line.material as THREE.LineBasicMaterial
    expect(material.opacity).toBeCloseTo(0.8)
    expect(material.color.getHexString()).toBe('ff5050')
    expect(material.depthTest).toBe(false)
  })

  it('grows the position attribute as samples accumulate (regression)', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 100)
    renderer.sync(state)
    const line = scene.getObjectByName('trajectory:ego')
    if (!(line instanceof THREE.Line)) throw new TypeError('line expected')

    expect(line.geometry.getAttribute('position').count).toBe(1)

    for (let i = 1; i <= 5; i++) {
      state.trajectories.append('ego', { timeSec: i, x: i, y: 0 }, 100)
    }
    renderer.sync(state)

    const position = line.geometry.getAttribute('position')
    expect(position.count).toBe(6)
    expect(position.array[0]).toBeCloseTo(0)
    expect(position.array[(6 - 1) * 3]).toBeCloseTo(5)
  })

  it('disposes geometry and material on dispose', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    renderer.sync(state)

    const line = scene.getObjectByName('trajectory:ego') as THREE.Line
    const geometrySpy = vi.spyOn(line.geometry, 'dispose')
    const materialSpy = vi.spyOn(
      line.material as THREE.LineBasicMaterial,
      'dispose',
    )

    renderer.dispose()

    expect(geometrySpy).toHaveBeenCalledTimes(1)
    expect(materialSpy).toHaveBeenCalledTimes(1)
    expect(scene.getObjectByName('trajectory:ego')).toBeFalsy()
  })
})
