import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SimulationProvider } from './SimulationProvider'
import { useSimulation } from './useSimulation'
import { ControlPanel } from '../ui/ControlPanel'
import { SimulationTimeDisplay } from '../ui/SimulationTimeDisplay'
import { EntityListPanel } from '../ui/EntityListPanel'
import { MetricsPanel } from '../ui/MetricsPanel'
import { RendererSettingsPanel } from '../ui/RendererSettingsPanel'
import { KeyboardControlPanel } from '../ui/KeyboardControlPanel'
import {
  SimulationViewportSwitcher,
  type SimulationViewportSwitcherHandle,
} from '../ui/viewport/SimulationViewportSwitcher'
import {
  DEFAULT_RENDERER_TYPE,
  type RendererType,
} from '../ui/viewport/RendererType'
import { SimulatorKeyboardControls } from '../ui/input/SimulatorKeyboardControls'
import {
  DEFAULT_KEYBOARD_CONTROL_UI_STATE,
  deriveKeyboardControlState,
  type KeyboardControlUiState,
} from '../ui/input/KeyboardControlState'
import {
  DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG,
  type ThreeTrajectoryVisualizationConfig,
} from '../ui/renderers/three/config/ThreeRendererConfig'
import {
  DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG,
  type PhaserTrajectoryVisualizationConfig,
} from '../ui/renderers/phaser/config/PhaserRendererConfig'
import {
  DEFAULT_TRAJECTORY_TRACKING_CONFIG,
  type TrajectoryTrackingConfig,
} from '../simulation/trajectories/TrajectoryTrackingConfig'
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

function AppShell() {
  const { engine, controller } = useSimulation()

  const [trajectoryVisualization, setTrajectoryVisualization] =
    useState<ThreeTrajectoryVisualizationConfig>(
      DEFAULT_THREE_TRAJECTORY_VISUALIZATION_CONFIG,
    )

  const [trajectoryTrackingConfig, setTrajectoryTrackingConfig] =
    useState<TrajectoryTrackingConfig>(() => ({
      ...DEFAULT_TRAJECTORY_TRACKING_CONFIG,
    }))
  const [trajectoryDebugEnabled, setTrajectoryDebugEnabled] = useState(false)

  const phaserTrajectoryVisualization = useMemo<PhaserTrajectoryVisualizationConfig>(
    () => ({
      ...DEFAULT_PHASER_TRAJECTORY_VISUALIZATION_CONFIG,
      enabled: trajectoryVisualization.enabled,
      color: trajectoryVisualization.color,
      opacity: trajectoryVisualization.opacity,
      lineWidth: trajectoryVisualization.lineWidth,
    }),
    [trajectoryVisualization],
  )

  const [rendererType, setRendererType] = useState<RendererType>(
    DEFAULT_RENDERER_TYPE,
  )

  const applyTrajectoryTracking = useCallback(
    (next: TrajectoryTrackingConfig) => {
      setTrajectoryTrackingConfig(next)
      controller.setTrajectoryTrackingConfig(next)
    },
    [controller],
  )

  const handleClearTrajectories = useCallback(() => {
    controller.clearTrajectories()
  }, [controller])

  const handleTrajectoryDebugEnabledChange = useCallback(
    (enabled: boolean) => {
      setTrajectoryDebugEnabled(enabled)
      controller.setTrajectoryDebugEnabled(enabled)
    },
    [controller],
  )

  const handleExportTrajectoryDebug = useCallback(() => {
    const records = controller.getTrajectoryDebugRecords()
    const blob = new Blob([JSON.stringify(records, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `trajectory-debug-${Date.now()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }, [controller])

  const handleClearTrajectoryDebug = useCallback(() => {
    controller.clearTrajectoryDebugRecords()
  }, [controller])

  const viewportSwitcherRef = useRef<SimulationViewportSwitcherHandle | null>(
    null,
  )

  const handleExportRendererDebug = useCallback(() => {
    const tagged =
      viewportSwitcherRef.current?.getActiveTrajectoryRendererDebugSummary()
    if (!tagged) {
      // eslint-disable-next-line no-console
      console.warn(
        '[trajectory-debug] Renderer debug summary unavailable. The viewport may not have initialized yet.',
      )
      return
    }
    // eslint-disable-next-line no-console
    console.log(
      `[trajectory-debug] ${tagged.renderer} renderer summary:`,
      tagged.summary,
    )
    const blob = new Blob([JSON.stringify(tagged.summary, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${tagged.renderer}-trajectory-renderer-debug-${Date.now()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }, [])

  useEffect(() => {
    setTrajectoryTrackingConfig(controller.getTrajectoryTrackingConfig())
    setTrajectoryDebugEnabled(controller.isTrajectoryDebugEnabled())
  }, [controller])

  useEffect(() => {
    return engine.events.on('scenarioLoaded', () => {
      setTrajectoryTrackingConfig(controller.getTrajectoryTrackingConfig())
    })
  }, [engine, controller])

  const [keyboardControlState, setKeyboardControlState] =
    useState<KeyboardControlUiState>(DEFAULT_KEYBOARD_CONTROL_UI_STATE)
  const lastInteractionRef = useRef<ScenarioInteractionConfig | undefined>(
    undefined,
  )

  const handleScenarioLoaded = useCallback((spec: ScenarioSpec) => {
    lastInteractionRef.current = spec.interaction
    setKeyboardControlState(deriveKeyboardControlState(spec.interaction))
  }, [])

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
            <SimulationViewportSwitcher
              ref={viewportSwitcherRef}
              rendererType={rendererType}
              threeTrajectoryVisualization={trajectoryVisualization}
              phaserTrajectoryVisualization={phaserTrajectoryVisualization}
            />
          </div>
          <aside className="layout-right" aria-label="Inspector">
            <h2 className="layout-title">Inspector</h2>
            <ControlPanel
              onScenarioLoaded={handleScenarioLoaded}
              rendererType={rendererType}
              onRendererTypeChange={setRendererType}
            />
            <SimulationTimeDisplay />
            <MetricsPanel />
            <KeyboardControlPanel
              state={keyboardControlState}
              onChange={setKeyboardControlState}
            />
            <RendererSettingsPanel
              trajectoryTrackingConfig={trajectoryTrackingConfig}
              onTrajectoryTrackingChange={applyTrajectoryTracking}
              trajectoryVisualization={trajectoryVisualization}
              onTrajectoryVisualizationChange={setTrajectoryVisualization}
              onClearTrajectories={handleClearTrajectories}
              trajectoryDebugEnabled={trajectoryDebugEnabled}
              onTrajectoryDebugEnabledChange={handleTrajectoryDebugEnabledChange}
              onExportTrajectoryDebug={handleExportTrajectoryDebug}
              onClearTrajectoryDebug={handleClearTrajectoryDebug}
              activeRendererType={rendererType}
              onExportActiveRendererDebug={handleExportRendererDebug}
            />
            <EntityListPanel />
          </aside>
        </div>
      </main>
    </>
  )
}
