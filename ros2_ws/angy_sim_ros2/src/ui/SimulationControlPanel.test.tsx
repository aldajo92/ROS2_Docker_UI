// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SimulationControlPanel } from './SimulationControlPanel'

const mocks = vi.hoisted(() => ({
  controller: {
    start: vi.fn(),
    pause: vi.fn(),
    step: vi.fn(),
    reset: vi.fn(),
  },
  isRunning: false,
  simulationTime: 12.3456,
}))

vi.mock('../app/useSimulation', () => ({
  useSimulation: () => ({
    controller: mocks.controller,
    engine: {} as unknown,
    commandQueue: {} as unknown,
  }),
  useSimulationRunning: () => mocks.isRunning,
  useSimulationTime: () => mocks.simulationTime,
  useEntityListVersion: () => 0,
}))

describe('SimulationControlPanel', () => {
  let container: HTMLDivElement
  let root: Root

  const mount = () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<SimulationControlPanel />)
    })
  }

  beforeEach(() => {
    mocks.isRunning = false
    mocks.simulationTime = 12.3456
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.clearAllMocks()
  })

  it('renders the Simulation card with the time readout', () => {
    mount()
    expect(container.querySelector('h2')?.textContent).toBe('Simulation Time')
    expect(container.querySelector('.time-value')?.textContent).toBe('12.346 s')
  })

  it('disables Start and Step while running, and disables Pause while stopped', () => {
    mount()
    const buttons = getButtons(container)
    expect(buttons.Start.disabled).toBe(false)
    expect(buttons.Pause.disabled).toBe(true)
    expect(buttons.Step.disabled).toBe(false)
    expect(buttons.Reset.disabled).toBe(false)

    act(() => {
      root.render(<SimulationControlPanel />)
    })
    mocks.isRunning = true
    act(() => {
      root.render(<SimulationControlPanel />)
    })

    const runningButtons = getButtons(container)
    expect(runningButtons.Start.disabled).toBe(true)
    expect(runningButtons.Pause.disabled).toBe(false)
    expect(runningButtons.Step.disabled).toBe(true)
    expect(runningButtons.Reset.disabled).toBe(false)
  })

  it('calls the existing controller methods', () => {
    mount()
    const buttons = getButtons(container)
    act(() => {
      buttons.Start.click()
      buttons.Step.click()
      buttons.Reset.click()
    })

    expect(mocks.controller.start).toHaveBeenCalledTimes(1)
    expect(mocks.controller.step).toHaveBeenCalledTimes(1)
    expect(mocks.controller.reset).toHaveBeenCalledTimes(1)

    mocks.isRunning = true
    act(() => {
      root.render(<SimulationControlPanel />)
    })
    act(() => {
      getButtons(container).Pause.click()
    })
    expect(mocks.controller.pause).toHaveBeenCalledTimes(1)
  })
})

function getButtons(container: HTMLElement): Record<string, HTMLButtonElement> {
  const buttons = [...container.querySelectorAll('button')]
  return Object.fromEntries(
    buttons.map((button) => [button.textContent ?? '', button]),
  ) as Record<string, HTMLButtonElement>
}
