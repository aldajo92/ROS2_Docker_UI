import { useCallback, useEffect, useRef, useState } from 'react'
import { SimulationProvider } from './SimulationProvider'
import { useSimulation } from './useSimulation'
import { ControlPanel } from '../ui/ControlPanel'
import { SimulationTimeDisplay } from '../ui/SimulationTimeDisplay'
import { EntityListPanel } from '../ui/EntityListPanel'
import { MetricsPanel } from '../ui/MetricsPanel'
import { RendererSettingsPanel } from '../ui/RendererSettingsPanel'
import { KeyboardControlPanel } from '../ui/KeyboardControlPanel'
import {
  ThreeSimulationViewport,
  type ThreeSimulationViewportHandle,
} from '../ui/viewport/ThreeSimulationViewport'
import { SimulatorKeyboardControls } from '../ui/input/SimulatorKeyboardControls'
import {
  DEFAULT_KEYBOARD_CONTROL_UI_STATE,
  deriveKeyboardControlState,
  type KeyboardControlUiState,
} from '../ui/input/KeyboardControlState'
import {
  DEFAULT_THREE_TRAIL_CONFIG,
  type ThreeTrailConfig,
} from '../ui/renderers/three/config/ThreeRendererConfig'
import type {
  ScenarioInteractionConfig,
  ScenarioSpec,
} from '../simulation/scenarios/Scenario'

export default function App() {
  return (
    <SimulationProvider>
      <AppShell />
    </SimulationProvider>
  )
}

/**
 * Lives inside `SimulationProvider` so it can call `useSimulation()`
 * for engine event subscriptions (notably `reset`, which we use to
 * reapply the most recent scenario's keyboard-control defaults).
 */
function AppShell() {
  const { engine } = useSimulation()

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

  // Keyboard-control state is also UI-only. Initial values come from
  // `scenario.interaction.keyboardControl`; the Inspector overrides
  // them at runtime. We stash the most recent scenario interaction
  // config in a ref so the engine `reset` event can reapply it
  // without holding the full spec.
  const [keyboardControlState, setKeyboardControlState] =
    useState<KeyboardControlUiState>(DEFAULT_KEYBOARD_CONTROL_UI_STATE)
  const lastInteractionRef = useRef<ScenarioInteractionConfig | undefined>(
    undefined,
  )

  const handleScenarioLoaded = useCallback((spec: ScenarioSpec) => {
    lastInteractionRef.current = spec.interaction
    setKeyboardControlState(deriveKeyboardControlState(spec.interaction))
  }, [])

  // Reapply the last scenario's keyboard defaults whenever the engine
  // resets — covers both manual Reset and the implicit reset that
  // happens inside `loadScenario(...)`. The scenarioLoaded callback
  // updates the ref *before* `controller.loadScenarioFromJson` runs,
  // so the new defaults are already in place when this fires.
  useEffect(() => {
    return engine.events.on('reset', () => {
      setKeyboardControlState(
        deriveKeyboardControlState(lastInteractionRef.current),
      )
    })
  }, [engine])

  return (
    <>
      <SimulatorKeyboardControls state={keyboardControlState} />
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
            <ControlPanel onScenarioLoaded={handleScenarioLoaded} />
            <SimulationTimeDisplay />
            <MetricsPanel />
            <KeyboardControlPanel
              state={keyboardControlState}
              onChange={setKeyboardControlState}
            />
            <RendererSettingsPanel
              trailConfig={trailConfig}
              onTrailConfigChange={setTrailConfig}
              onClearTrails={handleClearTrails}
            />
            <EntityListPanel />
          </aside>
        </div>
      </main>
    </>
  )
}
