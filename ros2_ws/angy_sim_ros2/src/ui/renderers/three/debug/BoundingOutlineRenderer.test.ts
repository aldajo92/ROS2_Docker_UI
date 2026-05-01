import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { EntityManager } from '../../../../simulation/core/EntityManager'
import { SimulationClock } from '../../../../simulation/core/SimulationClock'
import { SimulationState } from '../../../../simulation/core/SimulationState'
import { TypedEventBus } from '../../../../simulation/events/EventBus'
import type { SimulationEvents } from '../../../../simulation/events/SimulationEvents'
import { Logger } from '../../../../simulation/logging/Logger'
import { Point2D } from '../../../../math/geometry/Point2D'
import { Pose2D } from '../../../../math/geometry/Pose2D'
import { Vector2D } from '../../../../math/geometry/Vector2D'
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import { StaticObstacleEntity } from '../../../../simulation/entities/StaticObstacleEntity'
import { DynamicActorEntity } from '../../../../simulation/entities/DynamicActorEntity'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { BoundingOutlineRenderer } from './BoundingOutlineRenderer'

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

function outlineLoops(scene: THREE.Scene): THREE.LineLoop[] {
  const out: THREE.LineLoop[] = []
  scene.traverse((obj) => {
    if (obj instanceof THREE.LineLoop) out.push(obj)
  })
  return out
}

function loopPointCount(loop: THREE.LineLoop): number {
  const attr = loop.geometry.getAttribute('position')
  return attr ? attr.count : 0
}

describe('BoundingOutlineRenderer', () => {
  let scene: THREE.Scene
  let state: SimulationState
  let renderer: BoundingOutlineRenderer

  beforeEach(() => {
    scene = new THREE.Scene()
    state = createState()
    renderer = new BoundingOutlineRenderer(createContext(scene))
  })

  it('draws a circular LineLoop for circular static obstacles', () => {
    const obstacle = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(1, 2),
      shape: { type: 'circle', radius: 0.25 },
    })
    state.entities.add(obstacle)

    renderer.sync(state)

    const loops = outlineLoops(scene)
    expect(loops).toHaveLength(1)
    // 48-segment circle = 48 points.
    expect(loopPointCount(loops[0])).toBe(48)
    expect(loops[0].name).toMatch(/:circle$/)
  })

  it('draws a 4-point rectangle LineLoop for rectangle static obstacles', () => {
    const rect = new StaticObstacleEntity({
      id: 'wall',
      position: new Point2D(0, 0),
      shape: {
        type: 'rectangle',
        length: 4,
        thickness: 0.5,
        yaw: Math.PI / 6,
      },
    })
    state.entities.add(rect)

    renderer.sync(state)

    const loops = outlineLoops(scene)
    expect(loops).toHaveLength(1)
    expect(loopPointCount(loops[0])).toBe(4)
    expect(loops[0].name).toMatch(/:rectangle$/)
    // Yaw must have been applied to the mesh's rotation.y so the
    // rectangle geometry itself stays axis-aligned.
    expect(loops[0].rotation.y).toBeCloseTo(Math.PI / 6)
  })

  it('draws a circle outline for vehicles in circle mode (default)', () => {
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(0, 0), 0),
      radius: 0.3,
    })
    state.entities.add(vehicle)

    renderer.sync(state)

    const loops = outlineLoops(scene)
    expect(loops).toHaveLength(1)
    expect(loopPointCount(loops[0])).toBe(48)
    expect(loops[0].name).toMatch(/:circle$/)
  })

  it('draws a rectangle outline for vehicles in rectangle mode', () => {
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(2, -1), Math.PI / 2),
      radius: 0.3,
    })
    state.entities.add(vehicle)

    renderer.setConfig({ vehicleBoundingOutlineShape: 'rectangle' })
    renderer.sync(state)

    const loops = outlineLoops(scene)
    expect(loops).toHaveLength(1)
    expect(loopPointCount(loops[0])).toBe(4)
    expect(loops[0].name).toMatch(/:rectangle$/)
    expect(loops[0].rotation.y).toBeCloseTo(Math.PI / 2)
  })

  it('draws a circle outline for dynamic actors regardless of vehicle mode', () => {
    const actor = new DynamicActorEntity({
      id: 'npc',
      pose: new Pose2D(new Point2D(-3, 4), 0),
      velocity: new Vector2D(0, 0),
      radius: 0.2,
    })
    state.entities.add(actor)

    renderer.setConfig({ vehicleBoundingOutlineShape: 'rectangle' })
    renderer.sync(state)

    const loops = outlineLoops(scene)
    expect(loops).toHaveLength(1)
    expect(loops[0].name).toMatch(/:circle$/)
  })

  it('swaps the loop kind when the vehicle outline shape changes', () => {
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(0, 0), 0),
      radius: 0.3,
    })
    state.entities.add(vehicle)

    renderer.sync(state)
    expect(outlineLoops(scene)[0].name).toMatch(/:circle$/)

    renderer.setConfig({ vehicleBoundingOutlineShape: 'rectangle' })
    renderer.sync(state)

    const loops = outlineLoops(scene)
    expect(loops).toHaveLength(1)
    expect(loops[0].name).toMatch(/:rectangle$/)
  })

  it('removes loops when entities disappear', () => {
    const obstacle = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(0, 0),
      shape: { type: 'circle', radius: 0.2 },
    })
    state.entities.add(obstacle)

    renderer.sync(state)
    expect(outlineLoops(scene)).toHaveLength(1)

    state.entities.remove(obstacle.id)
    renderer.sync(state)
    expect(outlineLoops(scene)).toHaveLength(0)
  })

  it('dispose() clears all outline loops from the scene', () => {
    const obstacle = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(0, 0),
      shape: { type: 'circle', radius: 0.2 },
    })
    state.entities.add(obstacle)

    renderer.sync(state)
    renderer.dispose()

    expect(outlineLoops(scene)).toHaveLength(0)
  })
})
