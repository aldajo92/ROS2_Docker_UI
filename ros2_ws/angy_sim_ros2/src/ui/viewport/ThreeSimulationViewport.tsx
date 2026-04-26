import { useEffect, useRef } from 'react'
import { useSimulation } from '../../app/useSimulation'
import { ThreeSimulationRenderer } from '../renderers/three/core/ThreeSimulationRenderer'

/**
 * React-side mount point for the Three.js renderer.
 *
 * Responsibilities (and only these):
 *   - Mount a `<div>` and instantiate `ThreeSimulationRenderer` against it.
 *   - Forward sim events (`tick`, `reset`, `scenarioLoaded`,
 *     `entityAdded`, `entityRemoved`, `collision`) to the renderer.
 *   - Forward window resize.
 *   - Tear everything down on unmount.
 *
 * Explicitly NOT here:
 *   - Anything Three.js (`THREE.*` lives in `renderers/three/...`).
 *   - Vehicle / physics / scenario logic.
 *   - Calls to `entity.update(...)`. The engine owns the tick.
 *
 * Note: the spec mentions `engine.getState()`, but the real engine
 * exposes `engine.state` directly. We use the property accessor.
 */
export function ThreeSimulationViewport() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<ThreeSimulationRenderer | null>(null)
  const { engine } = useSimulation()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new ThreeSimulationRenderer(container)
    rendererRef.current = renderer
    renderer.init(engine.state)

    const renderCurrent = () => {
      renderer.render(engine.state)
    }

    // On reset / scenarioLoaded we wipe trails so a new run doesn't
    // visually inherit the old run's path.
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

    const handleResize = () => {
      renderer.resize()
      renderer.render(engine.state)
    }
    window.addEventListener('resize', handleResize)

    // Also re-fit on container resize (e.g. flexbox re-layout) — works
    // in all modern browsers; the listener falls through silently if
    // ResizeObserver is unavailable.
    let resizeObserver: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        renderer.resize()
        renderer.render(engine.state)
      })
      resizeObserver.observe(container)
    }

    return () => {
      for (const unsub of unsubs) unsub()
      window.removeEventListener('resize', handleResize)
      resizeObserver?.disconnect()
      renderer.dispose()
      rendererRef.current = null
    }
  }, [engine])

  return (
    <section className="panel viewport">
      <div className="viewport-header">
        <h2>Simulation View</h2>
      </div>
      <div
        ref={containerRef}
        className="viewport-stage three-viewport"
        role="img"
        aria-label="Three.js simulation viewport"
      />
    </section>
  )
}
