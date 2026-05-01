import { beforeEach, describe, expect, it } from 'vitest'
import type Phaser from 'phaser'
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
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserBoundingOutlineRenderer } from './PhaserBoundingOutlineRenderer'

/* -------------------------------------------------------------------- */
/*  Lightweight Phaser fakes — the renderer only touches `scene.add.   */
/*  circle`, `scene.add.rectangle`, and a handful of methods on the    */
/*  returned GameObjects. Modeled on `PhaserTrajectoryRenderer.test`.  */
/* -------------------------------------------------------------------- */

interface FakeGameObject {
  scene: FakeScene
  name: string
  destroyed: boolean
  x: number
  y: number
  rotation: number
  strokeWidth: number
  strokeColor: number
  strokeAlpha: number
  setName(name: string): FakeGameObject
  setPosition(x: number, y: number): FakeGameObject
  setRotation(r: number): FakeGameObject
  setStrokeStyle(
    width: number,
    color: number,
    alpha: number,
  ): FakeGameObject
  destroy(): void
}

interface FakeArc extends FakeGameObject {
  kind: 'arc'
  radius: number
  setRadius(r: number): FakeArc
}

interface FakeRectangle extends FakeGameObject {
  kind: 'rectangle'
  width: number
  height: number
  setSize(w: number, h: number): FakeRectangle
}

interface FakeScene {
  created: Array<FakeArc | FakeRectangle>
  add: {
    circle(
      x: number,
      y: number,
      radius: number,
      fillColor: number,
      fillAlpha: number,
    ): FakeArc
    rectangle(
      x: number,
      y: number,
      w: number,
      h: number,
      fillColor: number,
      fillAlpha: number,
    ): FakeRectangle
  }
}

function createBase(
  scene: FakeScene,
  kind: 'arc' | 'rectangle',
  x: number,
  y: number,
): FakeGameObject {
  const base: FakeGameObject = {
    scene,
    name: '',
    destroyed: false,
    x,
    y,
    rotation: 0,
    strokeWidth: 0,
    strokeColor: 0,
    strokeAlpha: 0,
    setName(name) {
      base.name = name
      return base
    },
    setPosition(nx, ny) {
      base.x = nx
      base.y = ny
      return base
    },
    setRotation(r) {
      base.rotation = r
      return base
    },
    setStrokeStyle(width, color, alpha) {
      base.strokeWidth = width
      base.strokeColor = color
      base.strokeAlpha = alpha
      return base
    },
    destroy() {
      base.destroyed = true
      scene.created = scene.created.filter(
        (g) => (g as FakeGameObject) !== base,
      )
    },
  }
  void kind
  return base
}

function createArc(
  scene: FakeScene,
  x: number,
  y: number,
  radius: number,
): FakeArc {
  const base = createBase(scene, 'arc', x, y)
  const arc: FakeArc = Object.assign(base, {
    kind: 'arc' as const,
    radius,
    setRadius(r: number) {
      arc.radius = r
      return arc
    },
  })
  return arc
}

function createRectangle(
  scene: FakeScene,
  x: number,
  y: number,
  w: number,
  h: number,
): FakeRectangle {
  const base = createBase(scene, 'rectangle', x, y)
  const rect: FakeRectangle = Object.assign(base, {
    kind: 'rectangle' as const,
    width: w,
    height: h,
    setSize(nw: number, nh: number) {
      rect.width = nw
      rect.height = nh
      return rect
    },
  })
  return rect
}

function createFakeScene(): FakeScene {
  const scene: FakeScene = {
    created: [],
    add: {
      circle(x, y, radius, _fc, _fa) {
        const arc = createArc(scene, x, y, radius)
        scene.created.push(arc)
        return arc
      },
      rectangle(x, y, w, h, _fc, _fa) {
        const rect = createRectangle(scene, x, y, w, h)
        scene.created.push(rect)
        return rect
      },
    },
  }
  return scene
}

function createState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

function createContext(scene: FakeScene): PhaserSceneContext {
  return {
    game: {} as Phaser.Game,
    scene: scene as unknown as Phaser.Scene,
    container: {} as HTMLElement,
    viewport: { originX: 100, originY: 200, pixelsPerMeter: 60 },
  }
}

describe('PhaserBoundingOutlineRenderer', () => {
  let scene: FakeScene
  let state: SimulationState
  let renderer: PhaserBoundingOutlineRenderer

  beforeEach(() => {
    scene = createFakeScene()
    state = createState()
    renderer = new PhaserBoundingOutlineRenderer(createContext(scene))
  })

  it('draws an Arc for circular static obstacles using the ring pattern', () => {
    const o = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(1, 0),
      shape: { type: 'circle', radius: 0.25 },
    })
    state.entities.add(o)

    renderer.sync(state)

    expect(scene.created).toHaveLength(1)
    const obj = scene.created[0]
    expect(obj.kind).toBe('arc')
    expect((obj as FakeArc).radius).toBeCloseTo(0.25 * 60)
    expect(obj.strokeWidth).toBeGreaterThan(0)
    // simPoint2DToPhaser: (x=1 m, y=0) with origin (100,200), ppm 60.
    expect(obj.x).toBeCloseTo(100 + 1 * 60)
    expect(obj.y).toBeCloseTo(200 - 0 * 60)
  })

  it('draws a Rectangle for rectangle static obstacles with yaw applied via rotation', () => {
    const rect = new StaticObstacleEntity({
      id: 'wall',
      position: new Point2D(0, 0),
      shape: {
        type: 'rectangle',
        length: 4,
        thickness: 0.5,
        yaw: Math.PI / 4,
      },
    })
    state.entities.add(rect)

    renderer.sync(state)

    expect(scene.created).toHaveLength(1)
    const obj = scene.created[0] as FakeRectangle
    expect(obj.kind).toBe('rectangle')
    expect(obj.width).toBeCloseTo(4 * 60)
    expect(obj.height).toBeCloseTo(0.5 * 60)
    // simYawToPhaserRotation negates sim yaw.
    expect(obj.rotation).toBeCloseTo(-Math.PI / 4)
  })

  it('draws an Arc for vehicles in circle mode (default)', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(0, 0), 0),
      radius: 0.3,
    })
    state.entities.add(v)

    renderer.sync(state)

    expect(scene.created[0].kind).toBe('arc')
  })

  it('draws a Rectangle for vehicles in rectangle mode and follows setConfig', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(0, 0), Math.PI / 2),
      radius: 0.3,
    })
    state.entities.add(v)

    renderer.setConfig({ vehicleBoundingOutlineShape: 'rectangle' })
    renderer.sync(state)

    expect(scene.created).toHaveLength(1)
    const obj = scene.created[0] as FakeRectangle
    expect(obj.kind).toBe('rectangle')
    // Length ratio = 5/3, width ratio = 1.0.
    expect(obj.width).toBeCloseTo(0.3 * (5 / 3) * 60)
    expect(obj.height).toBeCloseTo(0.3 * 1.0 * 60)
    expect(obj.rotation).toBeCloseTo(-Math.PI / 2)
  })

  it('draws an Arc for dynamic actors regardless of vehicle mode', () => {
    const a = new DynamicActorEntity({
      id: 'npc',
      pose: new Pose2D(new Point2D(2, -1), 0),
      velocity: new Vector2D(0, 0),
      radius: 0.2,
    })
    state.entities.add(a)

    renderer.setConfig({ vehicleBoundingOutlineShape: 'rectangle' })
    renderer.sync(state)

    const obj = scene.created[0]
    expect(obj.kind).toBe('arc')
    expect((obj as FakeArc).radius).toBeCloseTo(0.2 * 60)
  })

  it('swaps the game object when vehicle outline shape toggles', () => {
    const v = new VehicleEntity({
      id: 'ego',
      pose: new Pose2D(new Point2D(0, 0), 0),
      radius: 0.3,
    })
    state.entities.add(v)

    renderer.sync(state)
    const first = scene.created[0]
    expect(first.kind).toBe('arc')

    renderer.setConfig({ vehicleBoundingOutlineShape: 'rectangle' })
    renderer.sync(state)
    expect(first.destroyed).toBe(true)
    expect(scene.created).toHaveLength(1)
    expect(scene.created[0].kind).toBe('rectangle')
  })

  it('removes game objects for entities that disappear', () => {
    const o = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(0, 0),
      shape: { type: 'circle', radius: 0.2 },
    })
    state.entities.add(o)

    renderer.sync(state)
    expect(scene.created).toHaveLength(1)

    state.entities.remove(o.id)
    renderer.sync(state)
    expect(scene.created).toHaveLength(0)
  })

  it('dispose() destroys all outline game objects', () => {
    const o = new StaticObstacleEntity({
      id: 'pillar',
      position: new Point2D(0, 0),
      shape: { type: 'circle', radius: 0.2 },
    })
    state.entities.add(o)

    renderer.sync(state)
    renderer.dispose()

    expect(scene.created).toHaveLength(0)
  })
})
