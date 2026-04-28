import { beforeEach, describe, expect, it, vi } from 'vitest'
import type Phaser from 'phaser'
import { EntityManager } from '../../../../simulation/core/EntityManager'
import { SimulationClock } from '../../../../simulation/core/SimulationClock'
import { SimulationState } from '../../../../simulation/core/SimulationState'
import { TypedEventBus } from '../../../../simulation/events/EventBus'
import type { SimulationEvents } from '../../../../simulation/events/SimulationEvents'
import { Logger } from '../../../../simulation/logging/Logger'
import type { PhaserSceneContext } from '../core/PhaserSceneContext'
import { PhaserTrajectoryRenderer } from './PhaserTrajectoryRenderer'

/* -------------------------------------------------------------------- */
/*  Fakes — exercising the renderer without spinning up a real Phaser   */
/*  Game instance. Only the methods the renderer touches are stubbed.   */
/* -------------------------------------------------------------------- */

interface FakeGraphics {
  scene: FakeScene
  name: string
  visible: boolean
  clearCalls: number
  lineStyleArgs?: { width: number; color: number; alpha: number }
  beginPathCalls: number
  strokePathCalls: number
  moves: Array<{ x: number; y: number }>
  segments: Array<{ x: number; y: number }>
  destroyed: boolean
  setName(name: string): FakeGraphics
  setVisible(v: boolean): FakeGraphics
  clear(): FakeGraphics
  lineStyle(width: number, color: number, alpha: number): FakeGraphics
  beginPath(): FakeGraphics
  moveTo(x: number, y: number): FakeGraphics
  lineTo(x: number, y: number): FakeGraphics
  strokePath(): FakeGraphics
  destroy(): void
}

interface FakeScene {
  graphicsCreated: FakeGraphics[]
  add: { graphics(): FakeGraphics }
}

function createFakeGraphics(scene: FakeScene): FakeGraphics {
  const g: FakeGraphics = {
    scene,
    name: '',
    visible: true,
    clearCalls: 0,
    beginPathCalls: 0,
    strokePathCalls: 0,
    moves: [],
    segments: [],
    destroyed: false,
    lineStyleArgs: undefined,
    setName(name) {
      g.name = name
      return g
    },
    setVisible(v) {
      g.visible = v
      return g
    },
    clear() {
      g.clearCalls++
      g.moves = []
      g.segments = []
      g.lineStyleArgs = undefined
      return g
    },
    lineStyle(width, color, alpha) {
      g.lineStyleArgs = { width, color, alpha }
      return g
    },
    beginPath() {
      g.beginPathCalls++
      return g
    },
    moveTo(x, y) {
      g.moves.push({ x, y })
      return g
    },
    lineTo(x, y) {
      g.segments.push({ x, y })
      return g
    },
    strokePath() {
      g.strokePathCalls++
      return g
    },
    destroy() {
      g.destroyed = true
    },
  }
  return g
}

function createFakeScene(): FakeScene {
  const scene: FakeScene = {
    graphicsCreated: [],
    add: {
      graphics(): FakeGraphics {
        const g = createFakeGraphics(scene)
        scene.graphicsCreated.push(g)
        return g
      },
    },
  }
  return scene
}

function createContext(scene: FakeScene): PhaserSceneContext {
  return {
    game: {} as Phaser.Game,
    scene: scene as unknown as Phaser.Scene,
    container: {} as HTMLElement,
    viewport: { originX: 100, originY: 100, pixelsPerMeter: 10 },
  }
}

function createState(): SimulationState {
  return new SimulationState(
    new SimulationClock(),
    new EntityManager(),
    new TypedEventBus<SimulationEvents>(),
    new Logger(),
  )
}

describe('PhaserTrajectoryRenderer', () => {
  let state: SimulationState
  let scene: FakeScene
  let renderer: PhaserTrajectoryRenderer

  beforeEach(() => {
    state = createState()
    scene = createFakeScene()
    renderer = new PhaserTrajectoryRenderer(createContext(scene), {
      enabled: true,
      color: '#ff5050',
      opacity: 0.8,
      lineWidth: 2,
    })
  })

  it('reads state.trajectories and creates one Graphics per entity', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 1, y: 2 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 2, y: 2 }, 10)
    state.trajectories.append('actor', { timeSec: 0, x: -1, y: 3 }, 10)
    state.trajectories.append('actor', { timeSec: 1, x: -1, y: 4 }, 10)

    renderer.sync(state)

    const ego = scene.graphicsCreated.find((g) => g.name === 'trajectory:ego')
    const actor = scene.graphicsCreated.find(
      (g) => g.name === 'trajectory:actor',
    )
    expect(ego).toBeTruthy()
    expect(actor).toBeTruthy()
  })

  it('removes stale graphics when trajectories disappear', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 1, y: 0 }, 10)
    state.trajectories.append('actor', { timeSec: 0, x: 1, y: 1 }, 10)
    state.trajectories.append('actor', { timeSec: 1, x: 1, y: 2 }, 10)
    renderer.sync(state)

    const actor = scene.graphicsCreated.find(
      (g) => g.name === 'trajectory:actor',
    )
    expect(actor?.destroyed).toBe(false)

    state.trajectories.clear('actor')
    renderer.sync(state)

    expect(actor?.destroyed).toBe(true)
  })

  it('maps sim samples through simToPhaser coordinates', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 1, y: 0 }, 10)
    renderer.sync(state)

    const ego = scene.graphicsCreated.find((g) => g.name === 'trajectory:ego')
    expect(ego).toBeTruthy()
    if (!ego) throw new TypeError('ego graphics expected')
    expect(ego.moves[0]).toEqual({ x: 100, y: 100 })
    expect(ego.segments[0]).toEqual({ x: 110, y: 100 })
  })

  it('repaints from the latest samples on every sync (regression for renderer-local sampling)', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 1, y: 0 }, 10)
    renderer.sync(state)

    state.trajectories.append('ego', { timeSec: 2, x: 2, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 3, x: 3, y: 0 }, 10)
    renderer.sync(state)

    const ego = scene.graphicsCreated.find((g) => g.name === 'trajectory:ego')
    if (!ego) throw new TypeError('ego graphics expected')
    expect(ego.moves.at(-1)).toEqual({ x: 100, y: 100 })
    expect(ego.segments.length).toBe(3)
    expect(ego.segments.at(-1)).toEqual({ x: 130, y: 100 })
  })

  it('does not mutate trajectory data', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 1, y: 2, yaw: 0.3 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 2, y: 2 }, 10)
    const before = state.trajectories.get('ego')
    renderer.sync(state)
    const after = state.trajectories.get('ego')
    expect(after).toEqual(before)
  })

  it('hides existing lines when disabled, restores on re-enable', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 1, y: 0 }, 10)
    renderer.sync(state)
    const ego = scene.graphicsCreated.find((g) => g.name === 'trajectory:ego')
    if (!ego) throw new TypeError('ego graphics expected')
    expect(ego.visible).toBe(true)

    renderer.setEnabled(false)
    renderer.sync(state)
    expect(ego.visible).toBe(false)

    renderer.setEnabled(true)
    renderer.sync(state)
    expect(ego.visible).toBe(true)
  })

  it('debug summary mirrors the Three adapter for cross-renderer parity', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 1, y: 0 }, 10)
    state.trajectories.append('actor', { timeSec: 0, x: 5, y: 5 }, 10)
    renderer.sync(state)

    const summary = renderer.getDebugSummary()
    expect(summary.enabled).toBe(true)
    expect(summary.trajectoryCount).toBe(2)
    expect(summary.totalSampleCount).toBe(3)
    const ego = summary.perEntity.find((e) => e.entityId === 'ego')
    expect(ego?.sampleCount).toBe(2)
    expect(ego?.hasGraphics).toBe(true)
    expect(ego?.visible).toBe(true)
    expect(ego?.attachedToScene).toBe(true)
    expect(ego?.drawnPointCount).toBe(2)
    expect(ego?.firstScreenPoint).toEqual({ x: 100, y: 100 })
    expect(ego?.lastScreenPoint).toEqual({ x: 110, y: 100 })
  })

  it('disposes all graphics on dispose', () => {
    state.trajectories.append('ego', { timeSec: 0, x: 0, y: 0 }, 10)
    state.trajectories.append('ego', { timeSec: 1, x: 1, y: 0 }, 10)
    renderer.sync(state)
    const ego = scene.graphicsCreated.find((g) => g.name === 'trajectory:ego')
    if (!ego) throw new TypeError('ego graphics expected')
    const destroySpy = vi.spyOn(ego, 'destroy')

    renderer.dispose()

    expect(destroySpy).toHaveBeenCalledTimes(1)
  })
})
