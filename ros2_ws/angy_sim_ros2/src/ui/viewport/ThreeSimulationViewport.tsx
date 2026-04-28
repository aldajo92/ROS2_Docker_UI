import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useSimulation } from '../../app/useSimulation'
import { ThreeSimulationRenderer } from '../renderers/three/core/ThreeSimulationRenderer'
import type { CameraMode } from '../renderers/three/cameras/CameraMode'
import type { Projection } from '../renderers/three/cameras/Projection'
import type { ThreeTrajectoryVisualizationConfig } from '../renderers/three/config/ThreeRendererConfig'
import type { ThreeTrajectoryRendererDebugSummary } from '../renderers/three/objects/ThreeTrajectoryRenderer'

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
}

/**
 * React-side mount point for the Three.js renderer.
 */
export const ThreeSimulationViewport = forwardRef<
  ThreeSimulationViewportHandle,
  ThreeSimulationViewportProps
>(function ThreeSimulationViewport({ trajectoryVisualization }, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<ThreeSimulationRenderer | null>(null)
  const { engine } = useSimulation()

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

    const renderer = new ThreeSimulationRenderer(
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
          __threeTrajectoryDebug?: () =>
            | ThreeTrajectoryRendererDebugSummary
            | undefined
        }
      ).__threeTrajectoryDebug = () =>
        rendererRef.current?.getTrajectoryRendererDebugSummary()
    }

    setCameraMode(renderer.getCameraMode() ?? 'orbit')
    setProjection(renderer.getProjection())

    const renderCurrent = () => {
      renderer.render(engine.state)
    }

    const unsubs = [
      engine.events.on('tick', renderCurrent),
      engine.events.on('reset', renderCurrent),
      engine.events.on('scenarioLoaded', renderCurrent),
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
})
