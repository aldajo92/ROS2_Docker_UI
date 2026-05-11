// @vitest-environment happy-dom

import { describe, expect, it, afterEach, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useContext } from 'react'
import { SimulationProvider } from './SimulationProvider'
import { SimulationContext } from './SimulationContext'
import type { SimulationContextValue } from './SimulationContext'
import { buildVehicleMotionRuntimeAsync } from './buildVehicleMotionRuntimeAsync'
import { VehicleEntity } from '../simulation/entities/VehicleEntity'
import { Pose2D } from '../math/geometry/Pose2D'

let container: HTMLDivElement | null = null
let root: Root | null = null

function cleanup() {
  if (root) act(() => root!.unmount())
  container?.remove()
  root = null
  container = null
}

/**
 * Renders SimulationProvider with the given props and captures the context
 * value via a child component. Returns the captured value.
 */
function mountProvider(
  props: Omit<React.ComponentProps<typeof SimulationProvider>, 'children'> = {},
): SimulationContextValue {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)

  let captured: SimulationContextValue | null = null

  function Probe() {
    captured = useContext(SimulationContext)
    return null
  }

  act(() => {
    root!.render(
      <SimulationProvider {...props}>
        <Probe />
      </SimulationProvider>,
    )
  })

  if (!captured) throw new Error('SimulationContext not provided')
  return captured
}

describe('SimulationProvider', () => {
  afterEach(cleanup)

  it('default (no vehicleMotionRuntimeConfig) uses kinematic runtime — vehicle pose advances', () => {
    const ctx = mountProvider()
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: 0 },
    })
    ctx.engine.state.entities.add(vehicle)

    act(() => ctx.engine.step(1.0))

    expect(vehicle.pose.position.x).toBeGreaterThan(0)
  })

  it('explicit { type: "kinematic" } also advances vehicle pose', () => {
    const ctx = mountProvider({ vehicleMotionRuntimeConfig: { type: 'kinematic' } })
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: 0 },
    })
    ctx.engine.state.entities.add(vehicle)

    act(() => ctx.engine.step(1.0))

    expect(vehicle.pose.position.x).toBeCloseTo(1)
  })

  it('vehicleMotionRuntimeConfig remote: renders null initially, then provides working engine', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    let captured: SimulationContextValue | null = null
    function Probe() {
      captured = useContext(SimulationContext)
      return null
    }

    act(() => {
      root!.render(
        <SimulationProvider vehicleMotionRuntimeConfig={{ type: 'remote' }}>
          <Probe />
        </SimulationProvider>,
      )
    })
    expect(captured).toBeNull()

    await vi.waitFor(() => {
      if (captured === null) throw new Error('engine not ready')
    }, { timeout: 5000, interval: 50 })

    expect(captured).not.toBeNull()
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: 0 },
    })
    captured!.engine.state.entities.add(vehicle)
    // Remote step is async — await so the entity pose is written back before asserting.
    await act(async () => { await captured!.engine.step(1.0) })
    expect(vehicle.pose.position.x).toBeGreaterThan(0)
  })

  it('vehicleMotionRuntimeConfig rapier: renders null initially, then provides working engine', async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)

    let captured: SimulationContextValue | null = null
    function Probe() {
      captured = useContext(SimulationContext)
      return null
    }

    // First render — async init not yet complete; provider should render null
    act(() => {
      root!.render(
        <SimulationProvider vehicleMotionRuntimeConfig={{ type: 'rapier' }}>
          <Probe />
        </SimulationProvider>,
      )
    })
    expect(captured).toBeNull()

    // Poll until async WASM init + useEffect state update settles
    await vi.waitFor(() => {
      if (captured === null) throw new Error('engine not ready')
    }, { timeout: 5000, interval: 50 })

    expect(captured).not.toBeNull()
    const vehicle = new VehicleEntity({
      id: 'ego',
      pose: Pose2D.of(0, 0, 0),
      controls: { v: 1, w: 0 },
    })
    captured!.engine.state.entities.add(vehicle)
    act(() => captured!.engine.step(1.0))
    expect(vehicle.pose.position.x).toBeGreaterThan(0)
  })

  it('pre-built rapier runtime via vehicleMotionRuntime prop: vehicle pose advances', async () => {
    const rapierRuntime = await buildVehicleMotionRuntimeAsync({ type: 'rapier' })
    try {
      const ctx = mountProvider({ vehicleMotionRuntime: rapierRuntime })
      const vehicle = new VehicleEntity({
        id: 'ego',
        pose: Pose2D.of(0, 0, 0),
        controls: { v: 1, w: 0 },
      })
      ctx.engine.state.entities.add(vehicle)

      act(() => ctx.engine.step(1.0))

      expect(vehicle.pose.position.x).toBeGreaterThan(0)
    } finally {
      rapierRuntime.dispose?.()
    }
  })
})
