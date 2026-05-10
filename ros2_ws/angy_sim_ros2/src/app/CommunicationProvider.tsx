import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useSimulation } from './useSimulation'
import {
  CommunicationContext,
  type CommunicationContextValue,
  type TransportConnectionStatus,
} from './CommunicationContext'
import type { TopicDiscoveryState } from './TopicDiscovery'
import type {
  TopicEchoCapability,
  TopicEchoSession,
} from './TopicEcho'
import type {
  RenderableTopicCapability,
  RenderableTopicSelection,
} from './RenderableTopics'
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
  defaultServiceFactory,
  defaultTopicFactory,
} from '../infrastructure/communication/rosbridge/defaultRoslibFactories'
import { ROS_MESSAGE_TYPES } from '../infrastructure/communication/rosbridge/RosMessageTypes'
import { RosTwistToVehicleCommandAdapter } from '../infrastructure/communication/rosbridge/adapters/RosTwistToVehicleCommandAdapter'
import { SimClockToRosClockAdapter } from '../infrastructure/communication/rosbridge/adapters/SimClockToRosClockAdapter'
import { RosbridgeTopicDiscovery } from '../infrastructure/communication/rosbridge/RosbridgeTopicDiscovery'
import { RosbridgeTopicEcho } from '../infrastructure/communication/rosbridge/RosbridgeTopicEcho'
import { RosbridgeRenderableTopics } from '../infrastructure/communication/rosbridge/RosbridgeRenderableTopics'

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

/**
 * One enabled scenario / UI binding "Twist topic → vehicle". Mirrors
 * the JSON-safe `Ros2TwistControlBinding` carried by scenarios but
 * lives at the React/communication layer so the provider doesn't have
 * to import simulation-side scenario types.
 */
export interface Ros2TwistTopicBindingState {
  topic: string
  vehicleId: string
  enabled?: boolean
  scale?: {
    v?: number
    w?: number
  }
  limits?: {
    maxForwardSpeed?: number
    maxReverseSpeed?: number
    maxAngularSpeed?: number
  }
  /** Forward-compat; not yet honored by the runtime. */
  timeoutSec?: number
  /** Forward-compat; not yet honored by the runtime. */
  onTimeout?: 'stop'
}

/**
 * Filter a list of Twist bindings down to the ones that should
 * actually create a `VehicleCommandTopicBridge`. Exported so tests
 * can pin the contract:
 *   - undefined / empty input → no bridges
 *   - `enabled === false` is excluded
 *   - missing `enabled` is treated as enabled (matches the
 *     `enabled !== false` convention used by App.tsx and the JSON
 *     scenario projection)
 *
 * Note the deliberate absence of any fallback. Selecting the
 * rosbridge transport alone must NOT enable a default vehicle
 * binding; the only way `/cmd_vel → ego` becomes active is when
 * the user explicitly selects it in the topics panel or declares
 * it under `interaction.ros2TwistControls` in the scenario.
 */
export function resolveEnabledTwistBindings(
  bindings: ReadonlyArray<Ros2TwistTopicBindingState> | undefined,
): Ros2TwistTopicBindingState[] {
  if (!bindings || bindings.length === 0) return []
  return bindings.filter((b) => b.enabled !== false)
}

export interface CommunicationProviderProps {
  children: ReactNode
  /** Override env-derived config. Mostly useful for tests / Storybook. */
  config?: TransportConfig
  /**
   * ROS 2 Twist topic → vehicle bindings. The provider creates one
   * `VehicleCommandTopicBridge` per *enabled* entry. When omitted or
   * empty, no bridges are created — selecting the rosbridge transport
   * alone is not enough to start driving a vehicle. Bindings flow in
   * from either the Ros2 Topics panel (user picks a Twist topic →
   * vehicle pair) or the loaded scenario's
   * `interaction.ros2TwistControls`.
   */
  twistControlBindings?: ReadonlyArray<Ros2TwistTopicBindingState>
  /**
   * Outbound clock publish rate, in seconds. The default 50 Hz mirrors
   * `Topics.clock.frequencyHz` in `TopicRegistry.ts`.
   */
  clockPeriodSec?: number
}

const COMMUNICATION_SYSTEM_NAME = 'CommunicationSystem'

/**
 * Stable JSON key for a list of bindings. Used as a `useEffect`
 * dependency so the rosbridge wiring re-runs only when the *content*
 * of the bindings changes — array identity changes alone would force
 * a full reconnect on every parent re-render.
 */
function twistBindingsKey(
  bindings: ReadonlyArray<Ros2TwistTopicBindingState>,
): string {
  return JSON.stringify(
    bindings.map((b) => ({
      topic: b.topic,
      vehicleId: b.vehicleId,
      enabled: b.enabled !== false,
      scale: b.scale ?? null,
      limits: b.limits ?? null,
    })),
  )
}

export function CommunicationProvider({
  children,
  config: configOverride,
  twistControlBindings,
  clockPeriodSec = 1 / 50,
}: CommunicationProviderProps) {
  const { engine, commandQueue, externalPathQueue, externalPoseArrayQueue } = useSimulation()

  // Resolve the active list of bindings. The previous implementation
  // injected a `/cmd_vel → ego` fallback whenever the prop was empty,
  // which silently turned every rosbridge connection into a vehicle
  // controller. The product rule is now: no binding, no bridge — the
  // user must explicitly opt in via the topics panel or a scenario.
  // The dependency array below uses `twistBindingsKey(...)` to compare
  // *content* so parent re-renders alone don't churn rosbridge wiring.
  const requestedBindings: ReadonlyArray<Ros2TwistTopicBindingState> =
    twistControlBindings ?? []
  const enabledBindings = useMemo(
    () => resolveEnabledTwistBindings(requestedBindings),
    // Stringify so identity stays stable when content matches. The
    // hook-deps lint can't see through the JSON key, but the cost is
    // negligible compared to a transport reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [twistBindingsKey(requestedBindings)],
  )
  const bindingsKey = twistBindingsKey(requestedBindings)

  // The active transport config is stateful so the UI picker can swap
  // transports at runtime without a page reload. The initializer runs
  // once on mount: an explicit `configOverride` (tests / Storybook)
  // wins; otherwise we fall back to `import.meta.env`. Subsequent
  // changes flow through `setConfig` exposed via context.
  const [config, setConfig] = useState<TransportConfig>(() => {
    if (configOverride) return configOverride
    // import.meta.env is only meaningful in a Vite build / vitest run.
    // The cast keeps the helper portable.
    const env = (import.meta.env ?? {}) as Record<string, string | undefined>
    return readTransportConfig(env)
  })

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

  // Topic-discovery capability state. `undefined` means "no discovery
  // available on the active transport" (today: anything that isn't a
  // connected rosbridge). The provider owns this state because it
  // already owns the transport lifecycle, and a single `useEffect`
  // already tears down on every config change.
  const [topicDiscoveryState, setTopicDiscoveryState] = useState<
    TopicDiscoveryState | undefined
  >(undefined)

  // Topic-echo capability state. Holds the current echo capability
  // (with bound `sessions` snapshot + start/stop/close handlers) when
  // available, undefined otherwise. Mirrors the discovery lifecycle:
  // built once per rosbridge effect run, torn down on cleanup.
  const [topicEchoState, setTopicEchoState] = useState<
    TopicEchoCapability | undefined
  >(undefined)

  // Renderable-topic capability state. Same lifecycle as discovery /
  // echo: built per rosbridge effect run, torn down on cleanup. The
  // class itself owns subscription bookkeeping; we only mirror its
  // `selectedTopics` snapshot through React state so the UI checkbox
  // re-renders when a selection flips.
  const [renderableTopicsState, setRenderableTopicsState] = useState<
    RenderableTopicCapability | undefined
  >(undefined)

  // Live transport handle, published *after* `transport.connect()`
  // resolves. The Twist-bridge effect (below) keys off this slot so it
  // only runs against an already-open transport, and so that toggling
  // a Twist checkbox never re-runs the transport-lifecycle effect.
  // Cleared back to `null` whenever the transport effect tears down.
  const [connectedTransport, setConnectedTransport] = useState<Transport | null>(
    null,
  )

  useEffect(() => {
    if (config.kind === 'none') {
      // No transport to wire; the render-time `status` derivation
      // above already shows "disabled". The effect intentionally
      // does NOT call setState here.
      return
    }

    engine.logger?.debug(
      `[CommunicationProvider] transport effect mounted (kind="${config.kind}")`,
    )

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

      // ----- Topic-discovery capability (rosbridge-only) ----------------
      //
      // Built once per effect run. Lives until cleanup (config change /
      // unmount), at which point we clear the context value so the UI
      // stops rendering stale data. The discovery class itself never
      // imports `roslib` — it talks to the transport via callService.
      let discoveryRefresh: (() => void) | undefined
      if (transport instanceof RoslibRosbridgeTransport) {
        const rosbridgeTransport = transport
        const discovery = new RosbridgeTopicDiscovery(
          (name, type, request) =>
            rosbridgeTransport.callService(name, type, request),
        )

        // Coalesce concurrent refreshes — the UI may double-click or
        // repeated auto-loads can race during reconnect storms.
        let refreshing = false
        const refresh = (): void => {
          if (cancelled || refreshing) return
          refreshing = true
          setTopicDiscoveryState((prev) => ({
            status: 'loading',
            topics: prev?.topics ?? [],
            lastUpdated: prev?.lastUpdated,
            refresh,
          }))
          discovery
            .refreshTopics()
            .then((topics) => {
              if (cancelled) return
              setTopicDiscoveryState({
                status: 'ready',
                topics,
                lastUpdated: Date.now(),
                refresh,
              })
            })
            .catch((err: unknown) => {
              if (cancelled) return
              const message =
                err instanceof Error ? err.message : String(err)
              setTopicDiscoveryState((prev) => ({
                status: 'error',
                topics: prev?.topics ?? [],
                lastUpdated: prev?.lastUpdated,
                error: message,
                refresh,
              }))
            })
            .finally(() => {
              refreshing = false
            })
        }
        discoveryRefresh = refresh

        // Tear down: clear the capability so consumers don't keep
        // calling a stale refresh against a disconnected transport.
        cleanups.push(() => {
          engine.logger?.debug(
            '[CommunicationProvider] topic discovery reset',
          )
          setTopicDiscoveryState(undefined)
        })
      }

      // ----- Topic-echo capability (rosbridge-only) ---------------------
      //
      // Built alongside discovery. The echo class owns one rosbridge
      // subscription per active session and pushes a fresh snapshot
      // through `onChange` whenever a session changes (start, stop,
      // new message, error). We mirror that snapshot into React
      // state so the inspector cards re-render. The capability is
      // *seeded* with an empty-sessions handle on connect so the UI
      // has a callable `startEcho` before any topic is selected.
      let echoInstance: RosbridgeTopicEcho | null = null
      if (transport instanceof RoslibRosbridgeTransport) {
        const rosbridgeTransport = transport
        // The echo class only needs the two methods it actually uses.
        // Passing the transport directly would also work, but the
        // narrow adapter keeps the dependency graph (and
        // `RosbridgeTopicEcho.test.ts`) simple.
        echoInstance = new RosbridgeTopicEcho(
          {
            setTopicType: (name, type) =>
              rosbridgeTransport.setTopicType(name, type),
            subscribe: (name, handler) =>
              rosbridgeTransport.subscribe(name, handler),
          },
          (sessions: TopicEchoSession[]) => {
            if (cancelled || !echoInstance) return
            // Re-publish a fresh capability object on every change so
            // memoised consumers (`useMemo([sessions])`) actually
            // see the update. Handlers are bound on the instance and
            // stay stable for the lifetime of the effect run.
            setTopicEchoState({
              sessions,
              startEcho: echoInstance.startEcho.bind(echoInstance),
              stopEcho: echoInstance.stopEcho.bind(echoInstance),
              closeEcho: echoInstance.closeEcho.bind(echoInstance),
            })
          },
        )

        cleanups.push(() => {
          // Drop subscriptions BEFORE clearing context so any final
          // unsubscribe runs while the transport is still alive.
          echoInstance?.closeAll()
          echoInstance = null
          setTopicEchoState(undefined)
        })
      }

      // ----- Renderable-topic capability (rosbridge-only) --------------
      //
      // Owns one rosbridge subscription per *selected* renderable
      // topic. Per architecture rules, the class never touches
      // `SimulationState` directly — it pushes upserts/removes into
      // the simulation-side `externalPathQueue`, which
      // `ExternalPathRenderSystem` drains during the next tick.
      let renderableInstance: RosbridgeRenderableTopics | null = null
      if (transport instanceof RoslibRosbridgeTransport) {
        const rosbridgeTransport = transport
        renderableInstance = new RosbridgeRenderableTopics(
          {
            setTopicType: (name, type) =>
              rosbridgeTransport.setTopicType(name, type),
            subscribe: (name, handler) =>
              rosbridgeTransport.subscribe(name, handler),
          },
          externalPathQueue,
          {
            poseArrayQueue: externalPoseArrayQueue,
            onChange: (_selections: RenderableTopicSelection[]) => {
              if (cancelled || !renderableInstance) return
              // Re-publish the capability object so React notices the
              // change. The handlers are bound on the instance and
              // stay stable across renders.
              setRenderableTopicsState(
                makeRenderableSnapshot(renderableInstance),
              )
            },
          },
        )

        cleanups.push(() => {
          // closeAll() unsubscribes every selection AND enqueues
          // removes for the rendered paths. We must call this before
          // clearing the context so the path teardown is visible to
          // the next tick.
          renderableInstance?.closeAll()
          renderableInstance = null
          setRenderableTopicsState(undefined)
        })
      }

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

      // Connect first, then start the clock bridge. Twist bridges
      // live in a separate effect (below) keyed off `connectedTransport`,
      // so toggling a Twist checkbox never re-runs this transport
      // lifecycle.
      void (async () => {
        try {
          await transport!.connect()
          if (cancelled) {
            await transport!.disconnect()
            return
          }
          await clockBridge.start()
          // Publish the live transport so the Twist-bridge effect can
          // pick it up. Set after clockBridge.start() succeeds so we
          // don't expose a transport that's only half-wired.
          setConnectedTransport(transport!)
          // For mock/memory transports there is no live status feed;
          // mark connected explicitly so the UI doesn't get stuck on
          // 'connecting'.
          if (!(transport instanceof RoslibRosbridgeTransport)) {
            onStatus('connected')
          }
          // Topic discovery is rosbridge-only: seed the capability
          // with an `idle` snapshot now that the bridge is up, then
          // auto-load once. After this, the UI is in control via the
          // refresh button.
          if (
            transport instanceof RoslibRosbridgeTransport &&
            discoveryRefresh
          ) {
            const refresh = discoveryRefresh
            setTopicDiscoveryState({
              status: 'idle',
              topics: [],
              refresh,
            })
            refresh()
          }
          // Topic echo: seed an empty-sessions capability so the UI
          // can call `startEcho` immediately. Subsequent state
          // updates flow through the echo class's onChange callback.
          if (
            transport instanceof RoslibRosbridgeTransport &&
            echoInstance
          ) {
            const e = echoInstance
            setTopicEchoState({
              sessions: e.sessions,
              startEcho: e.startEcho.bind(e),
              stopEcho: e.stopEcho.bind(e),
              closeEcho: e.closeEcho.bind(e),
            })
          }
          // Renderable topics: seed an empty-selection capability so
          // the UI can render the per-row checkbox immediately. The
          // first onChange will fire when the user actually selects
          // a topic.
          if (
            transport instanceof RoslibRosbridgeTransport &&
            renderableInstance
          ) {
            setRenderableTopicsState(
              makeRenderableSnapshot(renderableInstance),
            )
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
      engine.logger?.debug(
        `[CommunicationProvider] transport effect cleanup (kind="${config.kind}")`,
      )
      // Clear the published transport BEFORE running cleanups so the
      // Twist-bridge effect (which depends on `connectedTransport`)
      // tears its bridges down with the transport still alive — its
      // bridge.stop() calls need the underlying connection.
      setConnectedTransport(null)
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
  }, [
    config,
    engine,
    externalPathQueue,
    externalPoseArrayQueue,
    clockPeriodSec,
  ])

  // ----- Inbound: Twist topic(s) → VehicleCommandQueue ----------------
  //
  // Dedicated effect for `VehicleCommandTopicBridge` lifecycle. Keyed
  // off `connectedTransport` (only runs against an already-open
  // transport) and `bindingsKey` (re-runs only when the *content* of
  // the bindings changes). This is the fix for the bug where toggling
  // a single Twist checkbox tore down the whole rosbridge stack —
  // toggles now create / stop only the Twist bridge.
  //
  // Audit logs (info-level so they're visible by default) prove the
  // contract from the surrounding architecture:
  //   - raw input from the prop
  //   - resolved enabled bindings
  //   - one line per bridge actually started (topic + vehicleId)
  //   - explicit "zero bridges" line when none are created
  //   - debug-level start/stop lines per bridge so a toggle shows up
  //     as exactly two log entries (stop the old, start the new) with
  //     no transport-cleanup line in between.
  useEffect(() => {
    if (connectedTransport === null) return

    engine.logger?.info(
      `[CommunicationProvider] twist bindings (raw, count=${requestedBindings.length}):`,
      requestedBindings,
    )
    engine.logger?.info(
      `[CommunicationProvider] twist bindings (enabled, count=${enabledBindings.length}):`,
      enabledBindings,
    )
    if (enabledBindings.length === 0) {
      engine.logger?.info(
        '[CommunicationProvider] no enabled twist bindings; skipping VehicleCommandTopicBridge setup',
      )
      return
    }

    const startedBridges: VehicleCommandTopicBridge[] = []
    let cancelled = false

    for (const binding of enabledBindings) {
      // rosbridge needs the wire type for each subscribed topic;
      // bindings declared at runtime won't be in the constructor
      // map for `RoslibRosbridgeTransport`, so we register them
      // dynamically. Mock / memory transports don't use this method
      // (it's optional on the generic Transport interface).
      if (connectedTransport instanceof RoslibRosbridgeTransport) {
        connectedTransport.setTopicType(binding.topic, ROS_MESSAGE_TYPES.twist)
      }
      let bindingAdapter: RosTwistToVehicleCommandAdapter
      try {
        bindingAdapter = new RosTwistToVehicleCommandAdapter({
          vehicleId: binding.vehicleId,
          ...(binding.scale !== undefined && { scale: binding.scale }),
          ...(binding.limits !== undefined && { limits: binding.limits }),
        })
      } catch (err) {
        // Surface the configuration error but don't tear down the
        // whole transport — other bindings may be valid.
        engine.logger?.warn(
          `[CommunicationProvider] dropping invalid Twist binding for "${binding.topic}" -> "${binding.vehicleId}": ${(err as Error).message}`,
        )
        continue
      }
      const bridge = new VehicleCommandTopicBridge(
        connectedTransport,
        binding.topic,
        commandQueue,
        bindingAdapter,
        engine.logger,
      )
      engine.logger?.info(
        `[CommunicationProvider] created VehicleCommandTopicBridge: topic="${binding.topic}" vehicleId="${binding.vehicleId}"`,
      )
      // Transport is already connected here, so start immediately.
      // Errors during start are logged but don't poison other bridges.
      void bridge
        .start()
        .then(() => {
          if (cancelled) return
          engine.logger?.debug(
            `[CommunicationProvider] twist bridge started: topic="${binding.topic}" vehicleId="${binding.vehicleId}"`,
          )
        })
        .catch((err: unknown) => {
          if (cancelled) return
          const message = err instanceof Error ? err.message : String(err)
          engine.logger?.warn(
            `[CommunicationProvider] twist bridge start failed for "${binding.topic}": ${message}`,
          )
        })
      startedBridges.push(bridge)
    }

    return () => {
      cancelled = true
      for (const bridge of startedBridges) {
        try {
          bridge.stop()
        } catch (err) {
          console.warn('[CommunicationProvider] twist bridge stop failed:', err)
        }
      }
      engine.logger?.debug(
        `[CommunicationProvider] twist bridges stopped (count=${startedBridges.length})`,
      )
    }
    // `requestedBindings` and `enabledBindings` are derived from
    // `bindingsKey` and stable per content; using the key as the
    // dependency keeps re-runs limited to real binding changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedTransport, bindingsKey, commandQueue, engine])

  // Guard the context value so callers never see rosbridge-specific
  // discovery / echo / renderable-topic state while the active
  // transport is something else. (The cleanup clears the state, but
  // render order vs. effect order can briefly expose stale data
  // without this filter.)
  const topicDiscovery =
    config.kind === 'rosbridge' ? topicDiscoveryState : undefined
  const topicEcho =
    config.kind === 'rosbridge' ? topicEchoState : undefined
  const renderableTopics =
    config.kind === 'rosbridge' ? renderableTopicsState : undefined

  const value = useMemo<CommunicationContextValue>(
    () => ({
      config,
      status,
      errorMessage,
      setConfig,
      topicDiscovery,
      topicEcho,
      renderableTopics,
    }),
    [
      config,
      status,
      errorMessage,
      setConfig,
      topicDiscovery,
      topicEcho,
      renderableTopics,
    ],
  )

  return (
    <CommunicationContext.Provider value={value}>
      {children}
    </CommunicationContext.Provider>
  )
}

/**
 * Wrap a `RosbridgeRenderableTopics` instance into a fresh
 * {@link RenderableTopicCapability} object so memoised consumers see
 * a new identity on each emit. Methods are bound to the instance so
 * they stay stable for the lifetime of the effect run.
 */
function makeRenderableSnapshot(
  instance: RosbridgeRenderableTopics,
): RenderableTopicCapability {
  return {
    selectedTopics: instance.selectedTopics,
    isRenderable: instance.isRenderable.bind(instance),
    getUnsupportedReason: instance.getUnsupportedReason.bind(instance),
    isSelected: instance.isSelected.bind(instance),
    selectTopic: instance.selectTopic.bind(instance),
    deselectTopic: instance.deselectTopic.bind(instance),
    getVisualConfig: instance.getVisualConfig.bind(instance),
    setVisualConfig: instance.setVisualConfig.bind(instance),
  }
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
        // `/clock` is the only outbound topic owned by this provider.
        // Inbound Twist topics are registered dynamically through
        // `transport.setTopicType()` once `twistControlBindings` resolve;
        // this keeps the hardcoded list short and in sync with the
        // single bridge created here.
        topicTypes: {
          '/clock': ROS_MESSAGE_TYPES.clock,
        },
        rosFactory: defaultRosFactory,
        topicFactory: defaultTopicFactory,
        // Required so the topic-discovery capability can call
        // /rosapi/topics through the same Ros connection.
        serviceFactory: defaultServiceFactory,
        onStatusChange,
      })
  }
}
