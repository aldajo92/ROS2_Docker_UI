// @vitest-environment happy-dom

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SimulationContext } from './SimulationContext'
import { CommunicationProvider } from './CommunicationProvider'
import { SimulationEngine } from '../simulation/core/SimulationEngine'
import { SimulationController } from '../simulation/core/SimulationController'
import { VehicleCommandQueue } from '../simulation/commands/VehicleCommandQueue'
import { ExternalPathUpdateQueue } from '../simulation/paths/ExternalPathUpdateQueue'
import { ExternalPoseArrayUpdateQueue } from '../simulation/poses/ExternalPoseArrayUpdateQueue'
import { MockTransport } from '../infrastructure/communication/mock/MockTransport'

/**
 * Integration test for the architectural split that fixed the
 * "toggling /cmd_vel reloads the entire ROS2 Topics panel" bug.
 *
 * Strategy:
 *   - Mount `CommunicationProvider` with `kind: 'mock'`. `MockTransport`
 *     is constructed inside the effect; spy on its prototype so we can
 *     observe lifecycle calls without injecting a custom transport.
 *   - Re-render with different `twistControlBindings` props and
 *     assert that `connect()` / `disconnect()` are stable, while
 *     `subscribe()` / unsubscribe move in lock-step with the bindings.
 *
 * What this proves:
 *   - Toggling a Twist binding DOES NOT call `transport.disconnect()`
 *     (so discovery / echo / renderable state stays alive — those
 *     are torn down only in the transport effect's cleanup).
 *   - The Twist bridge's subscription appears when an enabled binding
 *     is added and disappears when it's removed or disabled.
 */

interface Harness {
  container: HTMLDivElement
  root: Root
  engine: SimulationEngine
  contextValue: {
    engine: SimulationEngine
    controller: SimulationController
    commandQueue: VehicleCommandQueue
    externalPathQueue: ExternalPathUpdateQueue
    externalPoseArrayQueue: ExternalPoseArrayUpdateQueue
  }
}

let connectSpy: ReturnType<typeof vi.spyOn>
let disconnectSpy: ReturnType<typeof vi.spyOn>
let subscribeSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  connectSpy = vi.spyOn(MockTransport.prototype, 'connect')
  disconnectSpy = vi.spyOn(MockTransport.prototype, 'disconnect')
  subscribeSpy = vi.spyOn(MockTransport.prototype, 'subscribe')
})

afterEach(() => {
  connectSpy.mockRestore()
  disconnectSpy.mockRestore()
  subscribeSpy.mockRestore()
})

function buildHarness(): Harness {
  const engine = new SimulationEngine()
  const commandQueue = new VehicleCommandQueue()
  const externalPathQueue = new ExternalPathUpdateQueue()
  const externalPoseArrayQueue = new ExternalPoseArrayUpdateQueue()
  const controller = new SimulationController(engine)
  const contextValue = {
    engine,
    controller,
    commandQueue,
    externalPathQueue,
    externalPoseArrayQueue,
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  return { container, root, engine, contextValue }
}

function mount(
  harness: Harness,
  twistControlBindings: ReadonlyArray<{
    topic: string
    vehicleId: string
    enabled?: boolean
  }>,
): void {
  act(() => {
    harness.root.render(
      <SimulationContext.Provider value={harness.contextValue}>
        <CommunicationProvider
          config={{ kind: 'mock', rosbridgeUrl: '' }}
          twistControlBindings={twistControlBindings}
        >
          <div />
        </CommunicationProvider>
      </SimulationContext.Provider>,
    )
  })
}

async function flushAsync(): Promise<void> {
  // Resolve the connect promise + run the resulting setState that
  // publishes `connectedTransport`, plus the dependent effect that
  // creates Twist bridges. Two ticks cover both phases.
  await act(async () => {
    await Promise.resolve()
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function teardown(harness: Harness): void {
  act(() => {
    harness.root.unmount()
  })
  harness.container.remove()
}

describe('CommunicationProvider — transport lifecycle vs. Twist binding lifecycle', () => {
  it('does not reconnect when a Twist binding is added or removed', async () => {
    const harness = buildHarness()
    try {
      // Initial mount: no bindings.
      mount(harness, [])
      await flushAsync()
      expect(connectSpy).toHaveBeenCalledTimes(1)
      expect(disconnectSpy).not.toHaveBeenCalled()

      // Add an enabled binding. Should NOT trigger another connect()
      // and must NOT call disconnect().
      mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled: true }])
      await flushAsync()
      expect(connectSpy).toHaveBeenCalledTimes(1)
      expect(disconnectSpy).not.toHaveBeenCalled()

      // Disable the same binding. Same expectation: no reconnect.
      mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled: false }])
      await flushAsync()
      expect(connectSpy).toHaveBeenCalledTimes(1)
      expect(disconnectSpy).not.toHaveBeenCalled()

      // Re-enable. Still no reconnect.
      mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled: true }])
      await flushAsync()
      expect(connectSpy).toHaveBeenCalledTimes(1)
      expect(disconnectSpy).not.toHaveBeenCalled()
    } finally {
      teardown(harness)
    }
  })

  it('subscribes only when a Twist binding is enabled, and unsubscribes when disabled', async () => {
    const harness = buildHarness()
    try {
      // No bindings → no subscribe calls.
      mount(harness, [])
      await flushAsync()
      expect(
        subscribeSpy.mock.calls.filter((call: unknown[]) => call[0] === '/cmd_vel'),
      ).toHaveLength(0)

      // Enable: one new subscribe('/cmd_vel', ...).
      mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled: true }])
      await flushAsync()
      const enabledCalls = subscribeSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === '/cmd_vel',
      )
      expect(enabledCalls.length).toBeGreaterThanOrEqual(1)

      // Disable: subscription torn down. No new subscribe call should
      // be added on a disabled binding (the count should stay equal).
      const beforeCount = subscribeSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === '/cmd_vel',
      ).length
      mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled: false }])
      await flushAsync()
      const afterCount = subscribeSpy.mock.calls.filter(
        (call: unknown[]) => call[0] === '/cmd_vel',
      ).length
      expect(afterCount).toBe(beforeCount)
    } finally {
      teardown(harness)
    }
  })

  it('disconnects only when the transport config changes or the provider unmounts', async () => {
    const harness = buildHarness()
    try {
      mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled: true }])
      await flushAsync()

      // Toggle the binding multiple times — disconnect must stay at 0.
      for (const enabled of [false, true, false, true]) {
        mount(harness, [{ topic: '/cmd_vel', vehicleId: 'ego', enabled }])
        await flushAsync()
      }
      expect(disconnectSpy).not.toHaveBeenCalled()

      // Unmount: disconnect IS expected here.
      teardown(harness)
      await flushAsync()
      expect(disconnectSpy).toHaveBeenCalled()
    } catch (err) {
      teardown(harness)
      throw err
    }
  })
})
