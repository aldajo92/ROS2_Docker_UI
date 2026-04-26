import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useSimulation } from '../../app/useSimulation'
import { PhaserSimulationRenderer } from '../renderers/phaser/core/PhaserSimulationRenderer'
import type { PhaserTrailConfig } from '../renderers/phaser/config/PhaserRendererConfig'

/**
 * Imperative surface exposed to the parent for renderer-only side
 * effects (e.g. wiping trail history). Mirrors
 * `ThreeSimulationViewportHandle` so a parent that already drives the
 * Three viewport can drive this one with no changes beyond the
 * conditional mount.
 */
export interface PhaserSimulationViewportHandle {
  clearTrails(): void
}

export interface PhaserSimulationViewportProps {
  /**
   * Trail visualization config. Owned by the parent (e.g. `App.tsx`)
   * so the Inspector can edit it in React state. Changes are pushed
   * into the renderer via `useEffect`; the renderer instance itself
   * is NOT recreated on config change.
   */
  trailConfig?: PhaserTrailConfig
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
 *   - Apply renderer-config props (`trailConfig`) without recreating
 *     the renderer.
 *   - Tear everything down on unmount.
 *
 * Explicitly NOT here:
 *   - Anything Phaser-specific (`Phaser.*` lives in
 *     `renderers/phaser/...`).
 *   - Vehicle / physics / scenario logic.
 *   - Calls to `entity.update(...)`. The engine owns the tick.
 *
 * Switching between this and `ThreeSimulationViewport` is handled at
 * the App level — both components subscribe to the same engine, so
 * unmounting one and mounting the other does NOT reset the engine
 * state.
 */
export const PhaserSimulationViewport = forwardRef<
  PhaserSimulationViewportHandle,
  PhaserSimulationViewportProps
>(function PhaserSimulationViewport({ trailConfig }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<PhaserSimulationRenderer | null>(null)
  const { engine } = useSimulation()

  useImperativeHandle(
    ref,
    () => ({
      clearTrails: () => {
        rendererRef.current?.clearTrails()
      },
    }),
    [],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new PhaserSimulationRenderer(
      container,
      trailConfig ? { trail: trailConfig } : {},
    )
    rendererRef.current = renderer
    renderer.init(engine.state)

    const renderCurrent = () => {
      renderer.render(engine.state)
    }

    const renderAndClearTrails = () => {
      renderer.clearTrails()
      renderer.render(engine.state)
    }

    const unsubs = [
      engine.events.on('tick', renderCurrent),
      engine.events.on('reset', renderAndClearTrails),
      engine.events.on('scenarioLoaded', renderAndClearTrails),
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
    }
    // The renderer is rebuilt only when the engine identity changes
    // (effectively never — `SimulationProvider` keeps a single engine
    // across StrictMode passes). `trailConfig` updates are applied via
    // a separate effect to avoid recreating the renderer on every
    // Inspector slider tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine])

  // Push trail-config changes into the live renderer without
  // recreating it.
  useEffect(() => {
    if (!trailConfig) return
    rendererRef.current?.setTrailConfig(trailConfig)
  }, [trailConfig])

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
