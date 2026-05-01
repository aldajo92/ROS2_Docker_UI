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
import { VehicleEntity } from '../../../../simulation/entities/VehicleEntity'
import type { ThreeSceneContext } from '../core/ThreeSceneContext'
import { ThreeDebugLayer } from './ThreeDebugLayer'

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

describe('ThreeDebugLayer — option plumbing', () => {
  let scene: THREE.Scene
  let state: SimulationState

  beforeEach(() => {
    scene = new THREE.Scene()
    state = createState()
    state.entities.add(
      new VehicleEntity({
        id: 'ego',
        pose: new Pose2D(new Point2D(0, 0), 0),
        radius: 0.3,
      }),
    )
  })

  it('defaults match the pre-rename behavior: outlines on, vehicle = circle', () => {
    const layer = new ThreeDebugLayer(createContext(scene))
    const opts = layer.getOptions()
    expect(opts.showBoundingOutlines).toBe(true)
    expect(opts.vehicleBoundingOutlineShape).toBe('circle')
  })

  it('skips the bounding overlay when showBoundingOutlines is false', () => {
    const layer = new ThreeDebugLayer(createContext(scene), {
      showBoundingOutlines: false,
      showHeadingArrows: false,
    })
    layer.sync(state)
    expect(outlineLoops(scene)).toHaveLength(0)
  })

  it('toggles the bounding overlay off via setOptions', () => {
    const layer = new ThreeDebugLayer(createContext(scene), {
      showHeadingArrows: false,
    })
    layer.sync(state)
    expect(outlineLoops(scene)).toHaveLength(1)

    layer.setOptions({ showBoundingOutlines: false })
    layer.sync(state)
    expect(outlineLoops(scene)).toHaveLength(0)
  })

  it('switches the vehicle outline shape through setOptions', () => {
    const layer = new ThreeDebugLayer(createContext(scene), {
      showHeadingArrows: false,
    })
    layer.sync(state)
    expect(outlineLoops(scene)[0].name).toMatch(/:circle$/)

    layer.setOptions({ vehicleBoundingOutlineShape: 'rectangle' })
    layer.sync(state)
    expect(outlineLoops(scene)[0].name).toMatch(/:rectangle$/)
  })

  it('dispose() removes outlines from the scene', () => {
    const layer = new ThreeDebugLayer(createContext(scene), {
      showHeadingArrows: false,
    })
    layer.sync(state)
    expect(outlineLoops(scene)).toHaveLength(1)

    layer.dispose()
    expect(outlineLoops(scene)).toHaveLength(0)
  })
})
