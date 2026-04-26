import { forwardRef, useImperativeHandle, useRef } from 'react'
import {
  ThreeSimulationViewport,
  type ThreeSimulationViewportHandle,
} from './ThreeSimulationViewport'
import {
  PhaserSimulationViewport,
  type PhaserSimulationViewportHandle,
} from './PhaserSimulationViewport'
import type { ThreeTrailConfig } from '../renderers/three/config/ThreeRendererConfig'
import type { PhaserTrailConfig } from '../renderers/phaser/config/PhaserRendererConfig'
import type { RendererType } from './RendererType'

/**
 * Imperative surface the App uses to drive renderer-only side effects
 * (e.g. wiping trails) regardless of which adapter is mounted.
 */
export interface SimulationViewportSwitcherHandle {
  clearTrails(): void
}

export interface SimulationViewportSwitcherProps {
  rendererType: RendererType
  /** Trail config for the Three.js adapter. Ignored when Phaser is
   *  mounted; both renderers receive only their own config slice. */
  threeTrailConfig?: ThreeTrailConfig
  /** Trail config for the Phaser adapter. */
  phaserTrailConfig?: PhaserTrailConfig
}

/**
 * Conditionally mounts one of the renderer adapters. Switching the
 * `rendererType` prop unmounts the previous viewport (which disposes
 * its renderer cleanly) and mounts the new one (which initializes
 * from the current `engine.state`). The simulation engine is owned
 * by `SimulationProvider` higher up the tree, so a renderer switch
 * does NOT reset the simulation.
 *
 * The switcher exposes a unified imperative handle so renderer-
 * agnostic Inspector controls (e.g. "Clear trails") work without
 * branching on `rendererType`.
 */
export const SimulationViewportSwitcher = forwardRef<
  SimulationViewportSwitcherHandle,
  SimulationViewportSwitcherProps
>(function SimulationViewportSwitcher(
  { rendererType, threeTrailConfig, phaserTrailConfig },
  ref,
) {
  const threeRef = useRef<ThreeSimulationViewportHandle | null>(null)
  const phaserRef = useRef<PhaserSimulationViewportHandle | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      clearTrails: () => {
        threeRef.current?.clearTrails()
        phaserRef.current?.clearTrails()
      },
    }),
    [],
  )

  if (rendererType === 'phaser') {
    return (
      <PhaserSimulationViewport ref={phaserRef} trailConfig={phaserTrailConfig} />
    )
  }
  return (
    <ThreeSimulationViewport ref={threeRef} trailConfig={threeTrailConfig} />
  )
})
