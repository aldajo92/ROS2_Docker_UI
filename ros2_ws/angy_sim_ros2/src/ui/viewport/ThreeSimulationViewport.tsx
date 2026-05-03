import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useSimulation } from '../../app/useSimulation'
import {
  derror,
  dlog,
  isRenderDebugEnabled,
  makeFrameTracker,
  readMemoryMB,
  safeRun,
} from '../../debug/RenderDebug'
import { ThreeSimulationRenderer } from '../renderers/three/core/ThreeSimulationRenderer'
import type { CameraMode } from '../renderers/three/cameras/CameraMode'
import type { Projection } from '../renderers/three/cameras/Projection'
import type { ThreeTrajectoryVisualizationConfig } from '../renderers/three/config/ThreeRendererConfig'
import type { ThreeTrajectoryRendererDebugSummary } from '../renderers/three/objects/ThreeTrajectoryRenderer'
import type { DebugOverlayConfig } from '../renderers/debug/DebugOverlayConfig'
import type { SimulationState } from '../../simulation/core/SimulationState'

/** Cycle order used by the `c` key. Matches the manager's mode set. */
const CAMERA_MODE_CYCLE: readonly CameraMode[] = [
  'orbit',
  'followVehicle',
  'topDown',
]

const MODE_LABEL: Record<CameraMode, string> = {
  orbit: 'orbit',
  followVehicle: 'follow',
  topDown: 'top-down',
}

/**
 * Imperative surface: GPU cache clear only (does not clear simulation
 * `state.trajectories`). Prefer `controller.clearTrajectories()` for data.
 */
export interface ThreeSimulationViewportHandle {
  /** Clears Three.js line geometry cache only. */
  clearTrajectoryRenderCache(): void
  /** @deprecated Use {@link clearTrajectoryRenderCache} */
  clearTrails(): void
  /**
   * Temporary debug helper: returns an in-memory snapshot of the
   * Three.js trajectory renderer state for visibility/material/positioning
   * diagnosis. Returns `undefined` if the renderer is not initialized.
   */
  getTrajectoryRendererDebugSummary():
    | ThreeTrajectoryRendererDebugSummary
    | undefined
}

export interface ThreeSimulationViewportProps {
  /**
   * Trajectory **drawing** style for Three.js. Sampling lives in the
   * simulation (`TrajectoryTrackingSystem`).
   */
  trajectoryVisualization?: ThreeTrajectoryVisualizationConfig
  /**
   * Shape-aware debug overlay config. Applied to the renderer's debug
   * layer via `setDebugOptions`; driven from a single Inspector
   * control so Three.js and Phaser viewports stay in sync.
   */
  debugOverlay?: DebugOverlayConfig
  /**
   * Optional read-only state view used while the app is in replay
   * mode. When set the viewport renders this state on every change
   * instead of `engine.state`. See {@link SimulationViewportSwitcher}.
   */
  replayState?: SimulationState
}

/**
 * React-side mount point for the Three.js renderer.
 */
export const ThreeSimulationViewport = forwardRef<
  ThreeSimulationViewportHandle,
  ThreeSimulationViewportProps
>(function ThreeSimulationViewport(
  { trajectoryVisualization, debugOverlay, replayState },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<ThreeSimulationRenderer | null>(null)
  const { engine } = useSimulation()

  // Latest replay state, kept in a ref so the engine event subscriptions
  // installed once per mount can pick the right source on each tick
  // without retearing the effect every time the replay frame changes.
  const replayStateRef = useRef<SimulationState | undefined>(replayState)
  replayStateRef.current = replayState

  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [projection, setProjection] = useState<Projection>('perspective')

  useImperativeHandle(
    ref,
    () => ({
      clearTrajectoryRenderCache: () => {
        rendererRef.current?.clearTrajectoryRenderCache()
      },
      clearTrails: () => {
        rendererRef.current?.clearTrajectoryRenderCache()
      },
      getTrajectoryRendererDebugSummary: () =>
        rendererRef.current?.getTrajectoryRendererDebugSummary(),
    }),
    [],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    dlog('ThreeRenderer', 'mount: creating renderer')
    const renderer = new ThreeSimulationRenderer(
      container,
      trajectoryVisualization
        ? { trajectoryVisualization }
        : {},
    )
    rendererRef.current = renderer
    safeRun('ThreeRenderer', 'init', () => renderer.init(engine.state))
    dlog(
      'ThreeRenderer',
      `mount: renderer initialized memMB=`,
      readMemoryMB() ?? 'n/a',
    )

    if (typeof globalThis !== 'undefined') {
      ;(
        globalThis as unknown as {
          __threeTrajectoryDebug?: () =>
            | ThreeTrajectoryRendererDebugSummary
            | undefined
        }
      ).__threeTrajectoryDebug = () =>
        rendererRef.current?.getTrajectoryRendererDebugSummary()
    }

    setCameraMode(renderer.getCameraMode() ?? 'orbit')
    setProjection(renderer.getProjection())

    // Single source-of-truth for "what to render right now". When a
    // replay state is loaded we paint that; otherwise the live engine
    // state. The engine is paused in replay mode so the live event
    // subscriptions below stay quiet, but defensive selection here
    // means a stray event still paints the correct frame.
    const currentState = () => replayStateRef.current ?? engine.state

    // Frame tracker doubles as the "renderer is alive" heartbeat.
    // Logs FPS once per debug-throttle window so we can tell at a
    // glance whether the engine event stream stopped reaching Three.
    const frameTracker = makeFrameTracker('ThreeRenderer', 'engineDriven')
    const renderCurrent = () => {
      const ok = safeRun('ThreeRenderer', 'render', () =>
        renderer.render(currentState()),
      )
      // Only count successful renders. A throw here is logged with a
      // stack trace by `safeRun` and we still increment a separate
      // failure counter on the global toggle for post-hoc inspection.
      if (ok !== undefined) frameTracker.tick()
    }

    const unsubs = [
      engine.events.on('tick', renderCurrent),
      engine.events.on('reset', renderCurrent),
      engine.events.on('scenarioLoaded', renderCurrent),
      engine.events.on('entityAdded', renderCurrent),
      engine.events.on('entityRemoved', renderCurrent),
      engine.events.on('collision', renderCurrent),
    ]

    // Stall-detection watchdog. When debug logging is enabled and the
    // renderer is event-driven (i.e. no requestAnimationFrame loop),
    // a sudden silence is a meaningful signal — the engine stopped
    // ticking, all listeners were torn down, or something upstream is
    // throwing. We poll once per second and warn after 2s of silence.
    const STALL_GRACE_MS = 2000
    let lastSeenFrameCount = 0
    let lastSeenAtMs = nowMs()
    let stallReported = false
    const stallTimer = window.setInterval(() => {
      if (!isRenderDebugEnabled()) {
        stallReported = false
        lastSeenFrameCount = frameTracker.cumulative()
        lastSeenAtMs = nowMs()
        return
      }
      const cur = frameTracker.cumulative()
      const now = nowMs()
      if (cur !== lastSeenFrameCount) {
        lastSeenFrameCount = cur
        lastSeenAtMs = now
        stallReported = false
        return
      }
      const silenceMs = now - lastSeenAtMs
      if (!stallReported && silenceMs >= STALL_GRACE_MS) {
        stallReported = true
        derror(
          'ThreeRenderer',
          `STALL: no frames rendered for ${(silenceMs / 1000).toFixed(1)}s` +
            ` (cumulative=${cur}). engine.isRunning=${engine.isRunning()}` +
            ` ticks=${engine.state.metrics.ticks}` +
            ` paths=${engine.state.paths.toArray().length}`,
        )
      }
    }, 1000)

    const handleResize = () => {
      safeRun('ThreeRenderer', 'resize', () => {
        renderer.resize()
        renderer.render(currentState())
      })
    }
    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        safeRun('ThreeRenderer', 'resize:observer', () => {
          renderer.resize()
          renderer.render(currentState())
        })
      })
      resizeObserver.observe(container)
    }

    return () => {
      dlog(
        'ThreeRenderer',
        `unmount: cumulativeFrames=${frameTracker.cumulative()}`,
      )
      for (const unsub of unsubs) unsub()
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      window.clearInterval(stallTimer)
      renderer.dispose()
      rendererRef.current = null
      if (typeof globalThis !== 'undefined') {
        delete (
          globalThis as unknown as { __threeTrajectoryDebug?: unknown }
        ).__threeTrajectoryDebug
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    if (!trajectoryVisualization) return
    rendererRef.current?.setTrajectoryVisualizationConfig(trajectoryVisualization)
  }, [trajectoryVisualization])

  useEffect(() => {
    if (!debugOverlay) return
    rendererRef.current?.setDebugOptions({
      showBoundingOutlines: debugOverlay.showBoundingOutlines,
      vehicleBoundingOutlineShape: debugOverlay.vehicleBoundingOutlineShape,
    })
  }, [debugOverlay])

  // Repaint whenever the replay frame changes, or when the user
  // exits replay (state goes from defined → undefined): in the
  // latter case we sync back to the live engine state once.
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.render(replayState ?? engine.state)
  }, [replayState, engine])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (target.isContentEditable) return
      }
      const renderer = rendererRef.current
      if (!renderer) return

      const key = e.key.toLowerCase()
      if (key === 'c') {
        const current = renderer.getCameraMode() ?? 'orbit'
        const idx = CAMERA_MODE_CYCLE.indexOf(current)
        const next =
          CAMERA_MODE_CYCLE[(idx + 1) % CAMERA_MODE_CYCLE.length]
        renderer.setCameraMode(next)
        renderer.render(replayStateRef.current ?? engine.state)
        setCameraMode(next)
      } else if (key === 'p') {
        const next: Projection =
          renderer.getProjection() === 'perspective'
            ? 'orthographic'
            : 'perspective'
        renderer.setProjection(next)
        setProjection(next)
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [engine])

  return (
    <section className="panel viewport">
      <div className="viewport-header">
        <h2>Simulation View</h2>
        <span className="viewport-camera-indicator" aria-live="polite">
          {MODE_LABEL[cameraMode]} · {projection}
          <span className="viewport-key-hint"> (C / P)</span>
        </span>
      </div>
      <div
        ref={containerRef}
        className="viewport-stage three-viewport"
        role="img"
        aria-label="Three.js simulation viewport"
        tabIndex={0}
      />
    </section>
  )
})

function nowMs(): number {
  const perf = (
    globalThis as unknown as { performance?: { now?: () => number } }
  ).performance
  return perf?.now?.() ?? Date.now()
}
