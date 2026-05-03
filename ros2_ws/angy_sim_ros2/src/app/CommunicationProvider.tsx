import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSimulation } from './useSimulation'
import {
  CommunicationContext,
  type CommunicationContextValue,
  type TransportConnectionStatus,
} from './CommunicationContext'
import {
  DEFAULT_TRANSPORT_CONFIG,
  readTransportConfig,
  type TransportConfig,
} from './TransportConfig'
import type { Transport } from '../simulation/communication/Transport'
import { CommunicationSystem } from '../simulation/communication/CommunicationSystem'
import { PeriodicPublisher } from '../simulation/communication/PeriodicPublisher'
import { VehicleCommandTopicBridge } from '../simulation/communication/bridges/VehicleCommandTopicBridge'
import { ClockPublisherBridge } from '../simulation/communication/bridges/ClockPublisherBridge'
import { MockTransport } from '../infrastructure/communication/mock/MockTransport'
import { InMemoryTransport } from '../infrastructure/communication/memory/InMemoryTransport'
import {
  RoslibRosbridgeTransport,
  type RosbridgeStatus,
} from '../infrastructure/communication/rosbridge/RoslibRosbridgeTransport'
import {
  defaultRosFactory,
  defaultTopicFactory,
} from '../infrastructure/communication/rosbridge/defaultRoslibFactories'
import { ROS_MESSAGE_TYPES } from '../infrastructure/communication/rosbridge/RosMessageTypes'
import { RosTwistToVehicleCommandAdapter } from '../infrastructure/communication/rosbridge/adapters/RosTwistToVehicleCommandAdapter'
import { SimClockToRosClockAdapter } from '../infrastructure/communication/rosbridge/adapters/SimClockToRosClockAdapter'

/**
 * Composition root for external communication. Sits below
 * `SimulationProvider`: pulls the engine + commandQueue out of context,
 * builds a `Transport` (rosbridge / mock / memory / none) based on env
 * config, wires the inbound + outbound bridges, and registers a single
 * `CommunicationSystem` to drive periodic publishes off the engine
 * tick.
 *
 * Why a separate provider?
 *   - `SimulationProvider` stays synchronous and free of transport
 *     code, matching the architectural rule that the simulation core
 *     never sees ROS / WebSocket / DDS specifics.
 *   - Swapping transports later (DDS, MQTT, WebRTC, …) is a one-file
 *     edit here — bridges, adapters, and the engine never change.
 *
 * Inbound flow:
 *   ROS 2 /cmd_vel
 *     → rosbridge_server
 *     → roslibjs (inside RoslibRosbridgeTransport)
 *     → Transport.subscribe('/cmd_vel', ...)
 *     → RosTwistToVehicleCommandAdapter.toInternal()
 *     → VehicleCommandTopicBridge.commandQueue.push()
 *     → VehicleCommandSystem.update() drains during next tick
 *     → vehicle.setCommand(...)
 *
 * Outbound flow (engine clock):
 *   SimulationClock
 *     → ClockPublisherBridge.publishOnce() (driven by PeriodicPublisher
 *       inside CommunicationSystem; rate scales with sim time, NOT
 *       wall-clock — paused engine = no publishes)
 *     → SimClockToRosClockAdapter.fromInternal()
 *     → Transport.publish('/clock', { clock: { sec, nanosec } })
 *     → rosbridge_server → ROS 2 /clock
 */

export interface CommunicationProviderProps {
  children: ReactNode
  /** Override env-derived config. Mostly useful for tests / Storybook. */
  config?: TransportConfig
  /**
   * Vehicle id for inbound `/cmd_vel` Twist messages. Twist carries no
   * addressing info, so we choose the target at composition time.
   * Defaults to `'ego'` (matches the canonical scenario vehicle).
   */
  vehicleId?: string
  /**
   * Outbound clock publish rate, in seconds. The default 50 Hz mirrors
   * `Topics.clock.frequencyHz` in `TopicRegistry.ts`.
   */
  clockPeriodSec?: number
}

const COMMUNICATION_SYSTEM_NAME = 'CommunicationSystem'

export function CommunicationProvider({
  children,
  config: configOverride,
  vehicleId = 'ego',
  clockPeriodSec = 1 / 50,
}: CommunicationProviderProps) {
  const { engine, commandQueue } = useSimulation()

  const config = useMemo<TransportConfig>(() => {
    if (configOverride) return configOverride
    // import.meta.env is only meaningful in a Vite build / vitest run.
    // The cast keeps the helper portable.
    const env = (import.meta.env ?? {}) as Record<string, string | undefined>
    return readTransportConfig(env)
  }, [configOverride])

  // Status is keyed on `config.kind` so swapping configs at runtime
  // (e.g. via Storybook controls) starts from the right baseline
  // without needing a setState inside an effect — react-hooks/
  // set-state-in-effect explicitly forbids that pattern.
  const [statusByConfig, setStatus] = useState<{
    kind: TransportConfig['kind']
    status: TransportConnectionStatus
    errorMessage?: string
  }>(() => ({
    kind: config.kind,
    status: config.kind === 'none' ? 'disabled' : 'disconnected',
  }))
  const status: TransportConnectionStatus =
    statusByConfig.kind === config.kind
      ? statusByConfig.status
      : config.kind === 'none'
        ? 'disabled'
        : 'disconnected'
  const errorMessage =
    statusByConfig.kind === config.kind ? statusByConfig.errorMessage : undefined

  useEffect(() => {
    if (config.kind === 'none') {
      // No transport to wire; the render-time `status` derivation
      // above already shows "disabled". The effect intentionally
      // does NOT call setState here.
      return
    }

    let cancelled = false
    let transport: Transport | null = null
    let unsubscribeStatus: (() => void) | undefined
    const cleanups: Array<() => void | Promise<void>> = []

    const onStatus = (s: TransportConnectionStatus, err?: string) => {
      if (cancelled) return
      setStatus({
        kind: config.kind,
        status: s,
        errorMessage: s === 'error' ? err : undefined,
      })
    }

    try {
      transport = buildTransport(config, (status, err) => {
        // Translate the transport-specific status into the shell's
        // `TransportConnectionStatus`. The two enums are deliberately
        // structurally identical for now; the indirection keeps the
        // shell from importing a rosbridge type.
        onStatus(status as TransportConnectionStatus, err)
      })

      // Hook the status listener for transports that expose one. Only
      // RoslibRosbridgeTransport does today; mock/memory transports
      // don't push live status updates, but their state is tracked
      // through the connect()/disconnect() promises below.
      if (transport instanceof RoslibRosbridgeTransport) {
        unsubscribeStatus = transport.onStatusChange((s, err) =>
          onStatus(s as TransportConnectionStatus, err),
        )
        cleanups.push(() => unsubscribeStatus?.())
      }

      // ----- Inbound: /cmd_vel → VehicleCommandQueue ----------------
      const cmdAdapter = new RosTwistToVehicleCommandAdapter({ vehicleId })
      const cmdBridge = new VehicleCommandTopicBridge(
        transport,
        '/cmd_vel',
        commandQueue,
        cmdAdapter,
        engine.logger,
      )
      cleanups.push(() => cmdBridge.stop())

      // ----- Outbound: SimulationClock → /clock ---------------------
      const clockAdapter = new SimClockToRosClockAdapter()
      const clockBridge = new ClockPublisherBridge(
        transport,
        '/clock',
        engine,
        clockAdapter,
      )
      cleanups.push(() => clockBridge.stop())

      // The CommunicationSystem owns the periodic-publish accumulator
      // so the publish rate scales with simulation time, not wall
      // clock (paused engine = no publishes; fast-forward = faster
      // publishes). Registered LAST in the tick order so outbound
      // telemetry reflects the just-applied tick.
      const clockPublisher = new PeriodicPublisher(clockPeriodSec, () => {
        // Fire-and-forget; transport handles its own backpressure.
        void clockBridge.publishOnce()
      })
      const commsSystem = new CommunicationSystem([clockPublisher])

      // Defensive cleanup: a hot-reload could re-run this effect with
      // the system already registered. Remove first to keep
      // SystemManager.add invariant satisfied.
      engine.systems.remove(COMMUNICATION_SYSTEM_NAME)
      engine.systems.add(commsSystem)
      cleanups.push(() => {
        engine.systems.remove(COMMUNICATION_SYSTEM_NAME)
      })

      onStatus('connecting')

      // Connect first, then start bridges. Bridges that subscribe
      // require an open transport; doing both in series keeps errors
      // attributable.
      void (async () => {
        try {
          await transport!.connect()
          if (cancelled) {
            await transport!.disconnect()
            return
          }
          await cmdBridge.start()
          await clockBridge.start()
          // For mock/memory transports there is no live status feed;
          // mark connected explicitly so the UI doesn't get stuck on
          // 'connecting'.
          if (!(transport instanceof RoslibRosbridgeTransport)) {
            onStatus('connected')
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[CommunicationProvider] connect failed:', err)
          onStatus('error', message)
        }
      })()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[CommunicationProvider] setup failed:', err)
      onStatus('error', message)
    }

    return () => {
      cancelled = true
      // Run cleanups in reverse registration order. Errors are logged
      // but never thrown — unmount must complete.
      for (const fn of [...cleanups].reverse()) {
        try {
          const result = fn()
          if (result instanceof Promise) {
            void result.catch((err: unknown) => {
              console.warn('[CommunicationProvider] async cleanup failed:', err)
            })
          }
        } catch (err) {
          console.warn('[CommunicationProvider] cleanup failed:', err)
        }
      }
      void transport?.disconnect().catch((err: unknown) => {
        console.warn('[CommunicationProvider] disconnect failed:', err)
      })
    }
  }, [config, engine, commandQueue, vehicleId, clockPeriodSec])

  const value = useMemo<CommunicationContextValue>(
    () => ({ config, status, errorMessage }),
    [config, status, errorMessage],
  )

  return (
    <CommunicationContext.Provider value={value}>
      {children}
    </CommunicationContext.Provider>
  )
}

function buildTransport(
  config: TransportConfig,
  onStatusChange: (status: RosbridgeStatus, errorMessage?: string) => void,
): Transport {
  switch (config.kind) {
    case 'none':
      // The caller short-circuits this case before reaching here, but
      // exhaustiveness keeps TypeScript honest.
      throw new Error("buildTransport must not be called with kind 'none'")
    case 'mock':
      return new MockTransport()
    case 'memory':
      return new InMemoryTransport()
    case 'rosbridge':
      return new RoslibRosbridgeTransport({
        url: config.rosbridgeUrl || DEFAULT_TRANSPORT_CONFIG.rosbridgeUrl,
        topicTypes: {
          '/cmd_vel': ROS_MESSAGE_TYPES.twist,
          '/clock': ROS_MESSAGE_TYPES.clock,
        },
        rosFactory: defaultRosFactory,
        topicFactory: defaultTopicFactory,
        onStatusChange,
      })
  }
}
