import { useEffect, useRef, useState } from 'react'
import { useSimulation } from '../../app/useSimulation'
import { ThreeSimulationRenderer } from '../renderers/three/core/ThreeSimulationRenderer'
import type { CameraMode } from '../renderers/three/cameras/CameraMode'
import type { Projection } from '../renderers/three/cameras/Projection'

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
 * React-side mount point for the Three.js renderer.
 *
 * Responsibilities (and only these):
 *   - Mount a `<div>` and instantiate `ThreeSimulationRenderer` against it.
 *   - Forward sim events (`tick`, `reset`, `scenarioLoaded`,
 *     `entityAdded`, `entityRemoved`, `collision`) to the renderer.
 *   - Forward window / container resize.
 *   - Translate keyboard input into renderer commands:
 *       `c` → cycle camera mode (orbit → follow → top-down → orbit)
 *       `p` → toggle perspective ↔ orthographic projection
 *     This mirrors the ergonomics of `angelos_sim_ros2`.
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

  // UI-local mirror of renderer state for the header indicator. We keep
  // it in React state (rather than reading the renderer on every paint)
  // so the indicator only re-renders when something actually changed.
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [projection, setProjection] = useState<Projection>('perspective')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new ThreeSimulationRenderer(container)
    rendererRef.current = renderer
    renderer.init(engine.state)

    setCameraMode(renderer.getCameraMode() ?? 'orbit')
    setProjection(renderer.getProjection())

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

    const handleResize = () => {
      renderer.resize()
      renderer.render(engine.state)
    }
    window.addEventListener('resize', handleResize)

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

  // Keyboard controls (c = cycle camera mode, p = toggle projection).
  // Listening on `window` matches the angelos sim's ergonomics, where
  // the keys work no matter which child element has focus. We still
  // bail out if the user is editing a text field.
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
        renderer.render(engine.state)
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
}
