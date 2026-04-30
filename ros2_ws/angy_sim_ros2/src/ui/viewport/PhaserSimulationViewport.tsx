import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useSimulation } from '../../app/useSimulation'
import { PhaserSimulationRenderer } from '../renderers/phaser/core/PhaserSimulationRenderer'
import type { PhaserTrajectoryVisualizationConfig } from '../renderers/phaser/config/PhaserRendererConfig'
import type { PhaserTrajectoryRendererDebugSummary } from '../renderers/phaser/objects/PhaserTrajectoryRenderer'
import type { SimulationState } from '../../simulation/core/SimulationState'

/**
 * Imperative surface exposed to the parent for renderer-only side
 * effects (e.g. wiping the GPU/Graphics line cache, capturing a debug
 * snapshot). Mirrors `ThreeSimulationViewportHandle`.
 */
export interface PhaserSimulationViewportHandle {
  /** Drops cached `Graphics` objects only. Does NOT clear `state.trajectories`. */
  clearTrajectoryRenderCache(): void
  /** @deprecated Use {@link clearTrajectoryRenderCache}. */
  clearTrails(): void
  /**
   * Temporary debug helper: returns an in-memory snapshot of the
   * Phaser trajectory renderer state. Returns `undefined` if the
   * scene/renderer haven't initialized yet.
   */
  getTrajectoryRendererDebugSummary():
    | PhaserTrajectoryRendererDebugSummary
    | undefined
}

export interface PhaserSimulationViewportProps {
  /**
   * Trajectory **drawing** style for Phaser. Sampling lives in the
   * simulation (`TrajectoryTrackingSystem`).
   */
  trajectoryVisualization?: PhaserTrajectoryVisualizationConfig
  /**
   * Optional read-only state view used while the app is in replay
   * mode. When set the viewport renders this state on every change
   * instead of `engine.state`. See {@link SimulationViewportSwitcher}.
   */
  replayState?: SimulationState
}

/**
 * React-side mount point for the Phaser renderer.
 *
 * Responsibilities (and only these):
 *   - Mount a `<div>` and instantiate `PhaserSimulationRenderer`
 *     against it.
 *   - Forward sim events (`tick`, `reset`, `scenarioLoaded`,
 *     `entityAdded`, `entityRemoved`, `collision`) to the renderer.
 *   - Forward window / container resize.
 *   - Apply renderer-config props (`trajectoryVisualization`) without
 *     recreating the renderer.
 *   - Tear everything down on unmount.
 *
 * Switching between this and `ThreeSimulationViewport` is handled at
 * the App level — both components subscribe to the same engine, so
 * unmounting one and mounting the other does NOT reset the engine
 * state.
 */
export const PhaserSimulationViewport = forwardRef<
  PhaserSimulationViewportHandle,
  PhaserSimulationViewportProps
>(function PhaserSimulationViewport(
  { trajectoryVisualization, replayState },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<PhaserSimulationRenderer | null>(null)
  const { engine } = useSimulation()

  // Same pattern as the Three viewport — see ThreeSimulationViewport
  // for the rationale. Engine event subscriptions installed once per
  // mount must pick the right source on each tick without retearing
  // the effect when the replay frame changes.
  const replayStateRef = useRef<SimulationState | undefined>(replayState)
  replayStateRef.current = replayState

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

    const renderer = new PhaserSimulationRenderer(
      container,
      trajectoryVisualization
        ? { trajectoryVisualization }
        : {},
    )
    rendererRef.current = renderer
    renderer.init(engine.state)

    if (typeof globalThis !== 'undefined') {
      ;(
        globalThis as unknown as {
          __phaserTrajectoryDebug?: () =>
            | PhaserTrajectoryRendererDebugSummary
            | undefined
        }
      ).__phaserTrajectoryDebug = () =>
        rendererRef.current?.getTrajectoryRendererDebugSummary()
    }

    const renderCurrent = () => {
      renderer.render(replayStateRef.current ?? engine.state)
    }

    const unsubs = [
      engine.events.on('tick', renderCurrent),
      // After reset / scenarioLoaded the simulation wipes
      // state.trajectories itself, so the next sync removes stale
      // lines automatically. We only need to repaint.
      engine.events.on('reset', renderCurrent),
      engine.events.on('scenarioLoaded', renderCurrent),
      engine.events.on('entityAdded', renderCurrent),
      engine.events.on('entityRemoved', renderCurrent),
      engine.events.on('collision', renderCurrent),
    ]

    const handleResize = () => renderer.resize()
    window.addEventListener('resize', handleResize)

    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => renderer.resize())
      resizeObserver.observe(container)
    }

    return () => {
      for (const unsub of unsubs) unsub()
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      renderer.dispose()
      rendererRef.current = null
      if (typeof globalThis !== 'undefined') {
        delete (
          globalThis as unknown as { __phaserTrajectoryDebug?: unknown }
        ).__phaserTrajectoryDebug
      }
    }
    // The renderer is rebuilt only when the engine identity changes
    // (effectively never — `SimulationProvider` keeps a single engine
    // across StrictMode passes). `trajectoryVisualization` updates are
    // applied via a separate effect to avoid recreating the renderer
    // on every Inspector slider tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  useEffect(() => {
    if (!trajectoryVisualization) return
    rendererRef.current?.setTrajectoryVisualizationConfig(trajectoryVisualization)
  }, [trajectoryVisualization])

  // Repaint whenever the replay frame reference changes (or when
  // exiting replay → re-sync to the live state).
  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.render(replayState ?? engine.state)
  }, [replayState, engine])

  return (
    <section className="panel viewport">
      <div className="viewport-header">
        <h2>Simulation View</h2>
        <span className="viewport-camera-indicator" aria-live="polite">
          phaser · top-down
        </span>
      </div>
      <div
        ref={containerRef}
        className="viewport-stage phaser-viewport"
        role="img"
        aria-label="Phaser simulation viewport"
        tabIndex={0}
      />
    </section>
  )
})
