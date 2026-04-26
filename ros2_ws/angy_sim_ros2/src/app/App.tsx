import { useCallback, useRef, useState } from 'react'
import { SimulationProvider } from './SimulationProvider'
import { ControlPanel } from '../ui/ControlPanel'
import { SimulationTimeDisplay } from '../ui/SimulationTimeDisplay'
import { EntityListPanel } from '../ui/EntityListPanel'
import { MetricsPanel } from '../ui/MetricsPanel'
import { RendererSettingsPanel } from '../ui/RendererSettingsPanel'
import {
  ThreeSimulationViewport,
  type ThreeSimulationViewportHandle,
} from '../ui/viewport/ThreeSimulationViewport'
import { SimulatorKeyboardControls } from '../ui/input/SimulatorKeyboardControls'
import {
  DEFAULT_THREE_TRAIL_CONFIG,
  type ThreeTrailConfig,
} from '../ui/renderers/three/config/ThreeRendererConfig'

export default function App() {
  // Trail visualization is renderer-only state. Owning it here (not
  // in `SimulationProvider` / `SimulationState`) is what keeps the
  // simulation core renderer-agnostic — the engine never sees these
  // values.
  const [trailConfig, setTrailConfig] = useState<ThreeTrailConfig>(
    DEFAULT_THREE_TRAIL_CONFIG,
  )
  const viewportRef = useRef<ThreeSimulationViewportHandle | null>(null)

  const handleClearTrails = useCallback(() => {
    viewportRef.current?.clearTrails()
  }, [])

  return (
    <SimulationProvider>
      <SimulatorKeyboardControls />
      <main className="app-shell">
        <header>
          <h1>angy_sim_ros2</h1>
          <p className="subtitle">
            Rendering-agnostic simulation core · React UI shell only
          </p>
        </header>
        <div className="layout">
          <div className="layout-left">
            <ThreeSimulationViewport
              ref={viewportRef}
              trailConfig={trailConfig}
            />
          </div>
          <aside className="layout-right" aria-label="Inspector">
            <h2 className="layout-title">Inspector</h2>
            <ControlPanel />
            <SimulationTimeDisplay />
            <MetricsPanel />
            <RendererSettingsPanel
              trailConfig={trailConfig}
              onTrailConfigChange={setTrailConfig}
              onClearTrails={handleClearTrails}
            />
            <EntityListPanel />
          </aside>
        </div>
      </main>
    </SimulationProvider>
  )
}
