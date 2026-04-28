import { forwardRef, useImperativeHandle, useRef } from 'react'
import {
  PhaserSimulationViewport,
  type PhaserSimulationViewportHandle,
} from './PhaserSimulationViewport'
import {
  ThreeSimulationViewport,
  type ThreeSimulationViewportHandle,
} from './ThreeSimulationViewport'
import type { RendererType } from './RendererType'
import type { ThreeTrajectoryVisualizationConfig } from '../renderers/three/config/ThreeRendererConfig'
import type { PhaserTrajectoryVisualizationConfig } from '../renderers/phaser/config/PhaserRendererConfig'
import type { ThreeTrajectoryRendererDebugSummary } from '../renderers/three/objects/ThreeTrajectoryRenderer'
import type { PhaserTrajectoryRendererDebugSummary } from '../renderers/phaser/objects/PhaserTrajectoryRenderer'

/**
 * Tagged union returned by the active-renderer debug accessor. The
 * structures differ between adapters (Three has 3D positions and a
 * bounding box; Phaser has 2D screen points), so we keep them
 * separate at the type level rather than collapsing into a lossy
 * common shape.
 */
export type ActiveTrajectoryRendererDebugSummary =
  | { renderer: 'three'; summary: ThreeTrajectoryRendererDebugSummary }
  | { renderer: 'phaser'; summary: PhaserTrajectoryRendererDebugSummary }

/**
 * Clears Three.js GPU trajectory lines when Three is active; Phaser
 * `Graphics` cache when Phaser is active. Does **not** clear simulation
 * `state.trajectories` — use `controller.clearTrajectories()`.
 */
export interface SimulationViewportSwitcherHandle {
  clearTrajectoryRenderCache(): void
  /** @deprecated Use {@link clearTrajectoryRenderCache} */
  clearTrails(): void
  /**
   * Temporary debug helper: returns a renderer-specific snapshot for
   * the currently mounted viewport. Returns `undefined` before the
   * renderer has initialized.
   */
  getActiveTrajectoryRendererDebugSummary():
    | ActiveTrajectoryRendererDebugSummary
    | undefined
  /** @deprecated Use {@link getActiveTrajectoryRendererDebugSummary}. */
  getThreeTrajectoryRendererDebugSummary():
    | ThreeTrajectoryRendererDebugSummary
    | undefined
}

export interface SimulationViewportSwitcherProps {
  rendererType: RendererType
  /** Three.js trajectory line style (read-only drawing of sim data). */
  threeTrajectoryVisualization?: ThreeTrajectoryVisualizationConfig
  /** Phaser trajectory line style (read-only drawing of sim data). */
  phaserTrajectoryVisualization?: PhaserTrajectoryVisualizationConfig
}

/**
 * Mounts exactly one renderer viewport. Exposes a tiny imperative API
 * so Inspector actions can clear GPU caches without touching sim state.
 */
export const SimulationViewportSwitcher = forwardRef<
  SimulationViewportSwitcherHandle,
  SimulationViewportSwitcherProps
>(function SimulationViewportSwitcher(
  {
    rendererType,
    threeTrajectoryVisualization,
    phaserTrajectoryVisualization,
  },
  ref,
) {
  const threeRef = useRef<ThreeSimulationViewportHandle | null>(null)
  const phaserRef = useRef<PhaserSimulationViewportHandle | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      clearTrajectoryRenderCache: () => {
        threeRef.current?.clearTrajectoryRenderCache()
        phaserRef.current?.clearTrajectoryRenderCache()
      },
      clearTrails: () => {
        threeRef.current?.clearTrajectoryRenderCache()
        phaserRef.current?.clearTrajectoryRenderCache()
      },
      getActiveTrajectoryRendererDebugSummary: () => {
        const threeSummary =
          threeRef.current?.getTrajectoryRendererDebugSummary()
        if (threeSummary) return { renderer: 'three', summary: threeSummary }
        const phaserSummary =
          phaserRef.current?.getTrajectoryRendererDebugSummary()
        if (phaserSummary) return { renderer: 'phaser', summary: phaserSummary }
        return undefined
      },
      getThreeTrajectoryRendererDebugSummary: () =>
        threeRef.current?.getTrajectoryRendererDebugSummary(),
    }),
    [],
  )

  if (rendererType === 'phaser') {
    return (
      <PhaserSimulationViewport
        ref={phaserRef}
        trajectoryVisualization={phaserTrajectoryVisualization}
      />
    )
  }

  return (
    <ThreeSimulationViewport
      ref={threeRef}
      trajectoryVisualization={threeTrajectoryVisualization}
    />
  )
})
