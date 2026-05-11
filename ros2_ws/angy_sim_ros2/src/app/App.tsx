import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SimulationProvider } from './SimulationProvider'
import {
  CommunicationProvider,
  type Ros2TwistTopicBindingState,
} from './CommunicationProvider'
import type { ScenarioPublisherSpec } from '../simulation/scenarios/Scenario'
import { buildBaselineVehicleCommand } from './restoreVehicleBaseline'
import { useSimulation, useSimulationRunning } from './useSimulation'
import { ConnectionStatusPanel } from '../ui/ConnectionStatusPanel'
import {
  Ros2TopicsPanel,
  type TwistControlBindingSelection,
} from '../ui/Ros2TopicsPanel'
import { EchoCard } from '../ui/EchoCard'
import { useTopicEcho } from './useTopicEcho'
import { useRenderableTopics } from './useRenderableTopics'
import { ControlPanel } from '../ui/ControlPanel'
import { RendererPanel } from '../ui/RendererPanel'
import { SimulationControlPanel } from '../ui/SimulationControlPanel'
import { EntityListPanel } from '../ui/EntityListPanel'
import { MetricsPanel } from '../ui/MetricsPanel'
import { RendererSettingsPanel } from '../ui/RendererSettingsPanel'
import { RecordingPanel } from '../ui/RecordingPanel'
import { PerformanceOverlay } from '../ui/PerformanceOverlay'
import { PerformancePanel } from '../ui/PerformancePanel'
import { DebugOverlayPanel } from '../ui/DebugOverlayPanel'
import { DEFAULT_PROFILER_UPDATE_INTERVAL_MS } from './useSimulationProfiler'
import {
  DEFAULT_DEBUG_OVERLAY_CONFIG,
  type DebugOverlayConfig,
} from '../ui/renderers/debug/DebugOverlayConfig'
import { ScenarioEditorPanel } from '../ui/scenario/ScenarioEditorPanel'
import {
  clearRenderDebugLog,
  downloadRenderDebugLog,
  getRenderDebugLog,
  isRenderDebugEnabled,
  setRenderDebugEnabled,
} from '../debug/RenderDebug'
import {
  downloadScenarioJsonText,
  formatScenarioJson,
  normalizeScenarioFileName,
} from '../ui/scenario/ScenarioJsonUtils'
import { parseScenarioJson } from '../ui/scenario/ScenarioFileLoader'
import {
  actionsToTwistBindings,
  displaysToRenderableEntries,
  renderableSelectionsToDisplays,
  trySyncActionsIntoScenarioText,
  trySyncDisplaysIntoScenarioText,
} from '../ui/scenario/ScenarioTopicConfig'
import { downloadReplay } from '../ui/replay/ReplayFileDownloader'
import { LayoutSplitter } from '../ui/layout/LayoutSplitter'
import {
  MIN_INSPECTOR_WIDTH_PX,
  clampInspectorWidth,
} from '../ui/layout/clampInspectorWidth'
import { ReplayLoadButton } from '../ui/replay/ReplayLoadButton'
import { ReplayTimeline } from '../ui/replay/ReplayTimeline'
import { ReplayPlayer } from '../ui/replay/ReplayPlayer'
import { KeyboardControlPanel } from '../ui/KeyboardControlPanel'
import {
  SimulationViewportSwitcher,
  type SimulationViewportSwitcherHandle,
} from '../ui/viewport/SimulationViewportSwitcher'
import {
  DEFAULT_RENDERER_TYPE,
  type RendererType,
} from '../ui/viewport/RendererType'
import {
  DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG,
  type VehicleMotionRuntimeType,
} from '../simulation/physics/VehicleMotionRuntimeConfig'
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
import {
  DEFAULT_SIMULATION_RECORDER_CONFIG,
  type SimulationRecorderConfig,
  type SimulationRecorderStatus,
} from '../simulation/recording/SimulationRecorder'
import { ReplaySession } from '../simulation/recording/ReplaySession'
import { createReplayStateFromFrame } from '../simulation/recording/createReplayStateFromFrame'
import type { ReplayFileFormat } from '../simulation/recording/ReplayFormat'
import type { SimulationState } from '../simulation/core/SimulationState'
import type {
  ScenarioInteractionConfig,
  ScenarioSpec,
} from '../simulation/scenarios/Scenario'

/**
 * Mutually-exclusive top-level UI mode. While `'replay'`, the live
 * engine is paused and the renderer paints frames from the loaded
 * replay file. See `doc/PathsMigration/REPLAY-Phase3.md`.
 */
export type SimulationRunMode = 'live' | 'replay'

const REPLAY_DISABLED_REASON =
  'Recording is paused while a replay is loaded.'

/**
 * Top-level state container that lives ABOVE `CommunicationProvider`
 * so scenario / UI-driven Twist bindings can be passed in as a prop.
 * Why a wrapper instead of pushing the state into `AppShell`?
 *   - `CommunicationProvider` consumes the bindings to build runtime
 *     `VehicleCommandTopicBridge` instances.
 *   - The Ros2 Topics dropdown lives below `CommunicationProvider` and
 *     also needs the binding map.
 *   - Lifting the state to a shared parent keeps both consumers in
 *     lock-step without resorting to a third React context.
 */
export default function App() {
  const [twistControlBindings, setTwistControlBindings] = useState<
    Ros2TwistTopicBindingState[]
  >([])
  const [publishers, setPublishers] = useState<ScenarioPublisherSpec[]>([])
  const [motionRuntimeType, setMotionRuntimeType] =
    useState<VehicleMotionRuntimeType>(DEFAULT_VEHICLE_MOTION_RUNTIME_CONFIG.type)

  // rendererType lives here, above the keyed SimulationProvider, so it survives
  // runtime switches — the renderer adapter (Three.js / Phaser) is unrelated to
  // physics runtime and should not reset when the engine remounts.
  const [rendererType, setRendererType] = useState<RendererType>(DEFAULT_RENDERER_TYPE)

  return (
    // key={motionRuntimeType} remounts the entire SimulationProvider subtree when
    // the runtime type changes, giving the new engine a clean slate.  State that
    // must survive a runtime switch (rendererType, twistBindings, publishers) is
    // intentionally kept above this boundary.
    <SimulationProvider
      key={motionRuntimeType}
      vehicleMotionRuntimeConfig={{ type: motionRuntimeType }}
    >
      <CommunicationProvider
        twistControlBindings={twistControlBindings}
        publishers={publishers}
      >
        <AppShell
          twistControlBindings={twistControlBindings}
          onTwistControlBindingsChange={setTwistControlBindings}
          publishers={publishers}
          onPublishersChange={setPublishers}
          motionRuntimeType={motionRuntimeType}
          onMotionRuntimeTypeChange={setMotionRuntimeType}
          rendererType={rendererType}
          onRendererTypeChange={setRendererType}
        />
      </CommunicationProvider>
    </SimulationProvider>
  )
}

interface AppShellProps {
  twistControlBindings: Ros2TwistTopicBindingState[]
  onTwistControlBindingsChange: (
    next: Ros2TwistTopicBindingState[],
  ) => void
  publishers: ScenarioPublisherSpec[]
  onPublishersChange: (next: ScenarioPublisherSpec[]) => void
  motionRuntimeType: VehicleMotionRuntimeType
  onMotionRuntimeTypeChange: (next: VehicleMotionRuntimeType) => void
  /** Lifted above the SimulationProvider key boundary so it survives runtime switches. */
  rendererType: RendererType
  onRendererTypeChange: (next: RendererType) => void
}

function AppShell({
  twistControlBindings,
  onTwistControlBindingsChange,
  onPublishersChange,
  motionRuntimeType,
  onMotionRuntimeTypeChange,
  rendererType,
  onRendererTypeChange,
}: AppShellProps) {
  const { engine, controller, commandQueue } = useSimulation()
  const isRunning = useSimulationRunning()

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

  // Performance overlay is diagnostic-only; hidden by default so the
  // viewport starts uncluttered. The flag lives in the shell so both
  // the Inspector toggle and the overlay read the same source. The
  // refresh interval throttles only the UI — the profiler keeps
  // sampling every tick so the rolling window stays accurate.
  const [showPerformanceOverlay, setShowPerformanceOverlay] = useState(false)
  const [performanceOverlayUpdateIntervalMs, setPerformanceOverlayUpdateIntervalMs] =
    useState<number>(DEFAULT_PROFILER_UPDATE_INTERVAL_MS)

  // Shape-aware debug bounding outline. The state lives here so a
  // single Inspector control drives both the Three.js and Phaser
  // renderers — defaults match the previous always-on bounding-circle
  // behavior, so existing users see no visual change on load.
  const [debugOverlayConfig, setDebugOverlayConfig] = useState<DebugOverlayConfig>(
    DEFAULT_DEBUG_OVERLAY_CONFIG,
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

  // Render-pipeline debug logging — independent of the trajectory
  // tracker above. Wires the inspector toggle / Export / Clear buttons
  // to the in-memory ring buffer maintained by `src/debug/RenderDebug.ts`.
  // We poll the buffer entry count once a second so the inspector hint
  // ("Buffered entries: N") stays meaningful without a per-log
  // re-render.
  const [renderDebugEnabled, setRenderDebugEnabledState] = useState(() =>
    isRenderDebugEnabled(),
  )
  const [renderDebugEntryCount, setRenderDebugEntryCount] = useState(
    () => getRenderDebugLog().entryCount,
  )

  useEffect(() => {
    const id = window.setInterval(() => {
      // Cheap snapshot — just reads the buffer length, copies nothing
      // until Export is clicked.
      setRenderDebugEntryCount(getRenderDebugLog().entryCount)
    }, 1000)
    return () => window.clearInterval(id)
  }, [])

  const handleRenderDebugEnabledChange = useCallback((enabled: boolean) => {
    setRenderDebugEnabled(enabled)
    setRenderDebugEnabledState(enabled)
    // Refresh count immediately so the user sees the buffer freezing
    // (when disabling) or starting fresh (when enabling).
    setRenderDebugEntryCount(getRenderDebugLog().entryCount)
  }, [])

  const handleExportRenderDebug = useCallback(() => {
    downloadRenderDebugLog()
  }, [])

  const handleClearRenderDebug = useCallback(() => {
    clearRenderDebugLog()
    setRenderDebugEntryCount(0)
  }, [])

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

  // ----- "record while simulation runs" flag ---------------------------
  //
  // Semantics: the checkbox is the user's intent. Pressing Start (or any
  // other path that flips the engine to running) auto-starts recording;
  // pressing Pause auto-stops it so the user can hit "Save recording"
  // immediately after pausing. Toggling the checkbox while the engine is
  // already running has the same immediate effect, so the user doesn't
  // have to stop+start to arm recording mid-session.

  const [recordWhileRunning, setRecordWhileRunning] = useState(false)
  const recordWhileRunningRef = useRef(recordWhileRunning)
  useEffect(() => {
    recordWhileRunningRef.current = recordWhileRunning
  }, [recordWhileRunning])

  // ----- recording ------------------------------------------------------

  const [recordingConfig, setRecordingConfig] =
    useState<SimulationRecorderConfig>(() => ({
      ...DEFAULT_SIMULATION_RECORDER_CONFIG,
    }))
  const [recordingStatus, setRecordingStatus] =
    useState<SimulationRecorderStatus>(() => controller.getRecordingStatus())

  // Sync recording snapshot from the controller. Initial fetch + on
  // every recorder lifecycle event. Frame-count growth during an
  // active recording is updated by the per-tick subscription below.
  useEffect(() => {
    const refresh = () => {
      setRecordingConfig(controller.getRecordingConfig())
      setRecordingStatus(controller.getRecordingStatus())
    }
    refresh()
    const offs = [
      engine.events.on('recordingStarted', refresh),
      engine.events.on('recordingStopped', refresh),
      engine.events.on('recordingCleared', refresh),
      engine.events.on('recordingMaxFramesReached', refresh),
      engine.events.on('scenarioLoaded', refresh),
      engine.events.on('reset', refresh),
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [engine, controller])

  // Lightweight tick subscription: while recording, refresh the
  // status (cheap object read) so the live frame counter advances.
  useEffect(() => {
    if (!recordingStatus.recording) return
    return engine.events.on('tick', () => {
      setRecordingStatus(controller.getRecordingStatus())
    })
  }, [engine, controller, recordingStatus.recording])

  // ----- "record while running" wiring ---------------------------------
  //
  // Translates the user's checkbox intent into recorder lifecycle calls
  // by listening to engine `started`/`paused` events. We deliberately
  // do NOT branch on this flag in handleScenarioLoaded — Load doesn't
  // run the engine, so binding to the running state is the single
  // source of truth.
  useEffect(() => {
    const onStarted = () => {
      if (!recordWhileRunningRef.current) return
      if (controller.isRecording()) return
      controller.setRecordingConfig({
        enabled: true,
        sampleEveryNTicks: 1,
      })
      controller.startRecording()
    }
    const onPaused = () => {
      if (!controller.isRecording()) return
      controller.stopRecording()
    }
    const offs = [
      engine.events.on('started', onStarted),
      engine.events.on('paused', onPaused),
    ]
    return () => {
      for (const off of offs) off()
    }
  }, [engine, controller])

  const handleRecordWhileRunningChange = useCallback(
    (next: boolean) => {
      setRecordWhileRunning(next)
      // Mirror the new intent immediately. If the engine is already
      // running we want toggling-on to start recording right away (and
      // toggling-off to stop), so the user doesn't have to Pause+Start
      // just to flip the switch.
      if (next) {
        if (engine.isRunning() && !controller.isRecording()) {
          controller.setRecordingConfig({
            enabled: true,
            sampleEveryNTicks: 1,
          })
          controller.startRecording()
        }
      } else if (controller.isRecording()) {
        controller.stopRecording()
      }
    },
    [engine, controller],
  )

  const handleRecordingConfigChange = useCallback(
    (partial: Partial<SimulationRecorderConfig>) => {
      controller.setRecordingConfig(partial)
      setRecordingConfig(controller.getRecordingConfig())
      setRecordingStatus(controller.getRecordingStatus())
    },
    [controller],
  )

  const handleStartRecording = useCallback(() => {
    controller.startRecording()
  }, [controller])

  const handleStopRecording = useCallback(() => {
    controller.stopRecording()
  }, [controller])

  const handleClearRecording = useCallback(() => {
    controller.clearRecording()
  }, [controller])

  const handleDownloadRecording = useCallback(() => {
    if (controller.getRecordingFrameCount() === 0) {
      console.warn(
        '[recording] Download requested with zero frames; nothing to write.',
      )
      return
    }
    const replay = controller.exportRecording()
    downloadReplay(replay, { baseName: replay.scenarioName })
  }, [controller])

  // ----- replay --------------------------------------------------------

  const [runMode, setRunMode] = useState<SimulationRunMode>('live')
  const [replayState, setReplayState] = useState<SimulationState | undefined>(
    undefined,
  )
  const [replayCurrentIndex, setReplayCurrentIndex] = useState(0)
  const [replayCurrentTimeSec, setReplayCurrentTimeSec] = useState(0)
  const [replayFrameCount, setReplayFrameCount] = useState(0)
  const [replayDurationSec, setReplayDurationSec] = useState(0)
  const [replayIsPlaying, setReplayIsPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [replayError, setReplayError] = useState<string | null>(null)
  const replaySessionRef = useRef<ReplaySession | undefined>(undefined)
  const replayPlayerRef = useRef<ReplayPlayer | undefined>(undefined)

  const teardownReplay = useCallback(() => {
    replayPlayerRef.current?.dispose()
    replayPlayerRef.current = undefined
    replaySessionRef.current = undefined
  }, [])

  const handleExitReplay = useCallback(() => {
    teardownReplay()
    setReplayState(undefined)
    setRunMode('live')
    setReplayIsPlaying(false)
    setReplayCurrentIndex(0)
    setReplayCurrentTimeSec(0)
    setReplayFrameCount(0)
    setReplayDurationSec(0)
    setReplaySpeed(1)
    setReplayError(null)
  }, [teardownReplay])

  const handleReplayLoaded = useCallback(
    (replay: ReplayFileFormat) => {
      try {
        controller.pause()
        if (controller.isRecording()) controller.stopRecording()
        teardownReplay()

        const session = new ReplaySession(replay)
        const dt = session.getFixedDtSec()

        const frame0 = session.getCurrentFrame()
        setReplayState(createReplayStateFromFrame(frame0, dt))
        setReplayCurrentIndex(session.getCurrentIndex())
        setReplayCurrentTimeSec(frame0.timeSec)
        setReplayFrameCount(session.getFrameCount())
        setReplayDurationSec(session.getDurationSec())
        setReplayError(null)

        // Repaint on every cursor change. Auto-pause notification:
        // ReplayPlayer flips its own flag when the cursor reaches the
        // last frame; we mirror that flag into React state here so the
        // timeline button updates without polling.
        session.onChange(() => {
          const current = session.getCurrentFrame()
          setReplayState(createReplayStateFromFrame(current, dt))
          setReplayCurrentIndex(session.getCurrentIndex())
          setReplayCurrentTimeSec(current.timeSec)
          const player = replayPlayerRef.current
          if (player) setReplayIsPlaying(player.isPlaying())
        })

        const player = new ReplayPlayer(session, { speed: 1 })
        replaySessionRef.current = session
        replayPlayerRef.current = player

        setReplaySpeed(player.getSpeed())
        setReplayIsPlaying(false)
        setRunMode('replay')
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err)
        setReplayError(message)
        console.error('[replay] failed to start session:', err)
      }
    },
    [controller, teardownReplay],
  )

  // Dispose any active replay session/player when the App unmounts.
  useEffect(() => {
    return () => teardownReplay()
  }, [teardownReplay])

  const handleReplayPlay = useCallback(() => {
    const player = replayPlayerRef.current
    if (!player) return
    player.play()
    setReplayIsPlaying(player.isPlaying())
  }, [])

  const handleReplayPause = useCallback(() => {
    const player = replayPlayerRef.current
    if (!player) return
    player.pause()
    setReplayIsPlaying(false)
  }, [])

  const handleReplayStepForward = useCallback(() => {
    const session = replaySessionRef.current
    if (!session) return
    replayPlayerRef.current?.pause()
    setReplayIsPlaying(false)
    session.stepForward(1)
  }, [])

  const handleReplayStepBackward = useCallback(() => {
    const session = replaySessionRef.current
    if (!session) return
    replayPlayerRef.current?.pause()
    setReplayIsPlaying(false)
    session.stepBackward(1)
  }, [])

  const handleReplaySeekFrame = useCallback((index: number) => {
    const session = replaySessionRef.current
    if (!session) return
    replayPlayerRef.current?.pause()
    setReplayIsPlaying(false)
    session.seekToFrame(index)
  }, [])

  const handleReplaySpeedChange = useCallback((speed: number) => {
    const player = replayPlayerRef.current
    if (!player) return
    player.setSpeed(speed)
    setReplaySpeed(player.getSpeed())
  }, [])

  const handleReplayLoadError = useCallback((message: string) => {
    setReplayError(message)
    console.error('[replay] load failed:', message)
  }, [])

  const isReplayMode = runMode === 'replay'

  // Save button gate in `ControlPanel`. The user can save while paused
  // or stopped; we never download a replay while the live engine is
  // ticking (avoids the "downloaded a moving file" foot-gun).
  const saveRecordingDisabled =
    isRunning ||
    isReplayMode ||
    recordingStatus.frameCount === 0
  const saveRecordingDisabledReason = computeSaveRecordingDisabledReason({
    isRunning,
    isReplayMode,
    frameCount: recordingStatus.frameCount,
  })

  const [keyboardControlState, setKeyboardControlState] =
    useState<KeyboardControlUiState>(DEFAULT_KEYBOARD_CONTROL_UI_STATE)
  const lastInteractionRef = useRef<ScenarioInteractionConfig | undefined>(
    undefined,
  )

  // ----- scenario editor state ----------------------------------------
  //
  // App owns the canonical scenario JSON for the editor card. Any path
  // that loads a scenario (bundled dropdown, file upload, editor apply)
  // routes through `handleScenarioLoaded` and ends up writing here, so
  // the editor preview is always consistent with what's running.
  const [currentScenarioSpec, setCurrentScenarioSpec] = useState<
    ScenarioSpec | undefined
  >(undefined)
  const [currentScenarioText, setCurrentScenarioText] = useState('')
  const [currentScenarioFileName, setCurrentScenarioFileName] = useState<
    string | undefined
  >(undefined)
  const [scenarioEditorError, setScenarioEditorError] = useState<
    string | undefined
  >(undefined)
  // Expanding the editor swaps it into a "fullscreen-in-the-inspector"
  // mode that hides the sibling Scenario card. App owns the flag so
  // ControlPanel render-suppression and ScenarioEditorPanel layout
  // stay in sync.
  const [scenarioEditorExpanded, setScenarioEditorExpanded] = useState(false)

  // ROS2 Topics card has its own "fullscreen-in-the-inspector" mode
  // (mutually exclusive with the scenario editor's expanded mode).
  // While expanded, sibling cards collapse so the topic list and the
  // resulting echo cards have room to grow, and Echo actions become
  // enabled inside the panel.
  const [ros2TopicsExpanded, setRos2TopicsExpanded] = useState(false)
  // If both expansion flags ever flipped true together, the inspector
  // would be unable to render either card meaningfully. Guarding via
  // the setters keeps the invariant that at most one card is expanded
  // at a time without burying it in the JSX.
  const handleScenarioEditorExpandedChange = useCallback((next: boolean) => {
    setScenarioEditorExpanded(next)
    if (next) setRos2TopicsExpanded(false)
  }, [])
  const handleRos2TopicsExpandedChange = useCallback((next: boolean) => {
    setRos2TopicsExpanded(next)
    if (next) setScenarioEditorExpanded(false)
  }, [])

  const echo = useTopicEcho()
  const echoSessions = echo?.sessions ?? []
  const isTransportConnected = echo !== undefined

  // Renderable-topic capability — the source of truth for the live
  // display state surfaced by `Ros2TopicsPanel`. We project its
  // `selectedTopics` snapshot back into the scenario editor JSON as
  // `displays[]` entries, and we apply scenario-declared displays on load.
  const renderableTopics = useRenderableTopics()
  // Mirrors `renderableTopics` so `handleScenarioLoaded` can read the
  // latest capability without taking it as a hook dependency (the
  // callback would otherwise change identity each time the capability
  // re-emits, churning the props passed to `ScenarioEditorPanel`).
  const renderableTopicsRef = useRef(renderableTopics)
  useEffect(() => {
    renderableTopicsRef.current = renderableTopics
  }, [renderableTopics])
  // Pending scenario-declared visualization waiting for the
  // `renderableTopics` capability to come online (e.g. user loaded a
  // scenario before rosbridge connected). The effect below drains it
  // exactly once per scenario load and clears the ref so further
  // selection edits aren't overridden on reconnect.
  const pendingScenarioDisplaysRef = useRef<
    ScenarioSpec['displays'] | null
  >(null)

  const handleScenarioLoaded = useCallback(
    (spec: ScenarioSpec) => {
      lastInteractionRef.current = spec.interaction
      setKeyboardControlState(deriveKeyboardControlState(spec.interaction))
      setScenarioEditorError(undefined)

      // Replace the live Twist topic → vehicle bindings with whatever
      // the scenario declares. Empty / missing maps to "no bindings"
      // and the CommunicationProvider creates zero bridges in that
      // case — the user must explicitly select a Twist topic in the
      // Ros2 Topics panel (or declare one in the scenario JSON) to
      // expose vehicle control.
      onTwistControlBindingsChange(actionsToTwistBindings(spec.actions ?? []))
      onPublishersChange(spec.publishers ?? [])

      // Compute the editor text. Two cases matter:
      //
      //   1. The loaded spec brings its own `displays` block — honor it
      //      as-is. Capability state is reconciled by the pending-apply
      //      effect below; the reactive sync will eventually re-project
      //      the merged result into the editor.
      //
      //   2. The spec has NO `displays` but the capability already has
      //      selected topics (the user clicked rows *before* loading the
      //      scenario). Project those into the editor JSON immediately so
      //      it stays consistent with what is being rendered. Without this
      //      the editor would silently claim "no displays" while a path
      //      was still on screen.
      const cap = renderableTopicsRef.current
      const baseText = formatScenarioJson(spec)
      let editorText = baseText
      let editorSpec: ScenarioSpec = spec
      if (!(spec.displays?.length) && cap && cap.selectedTopics.length > 0) {
        const synced = trySyncDisplaysIntoScenarioText(baseText, cap.selectedTopics)
        if (synced.ok && synced.changed) {
          editorText = synced.text
          editorSpec = synced.spec
        }
      }
      setCurrentScenarioSpec(editorSpec)
      setCurrentScenarioText(editorText)
      setCurrentScenarioFileName(
        normalizeScenarioFileName(spec.name) ?? 'scenario.json',
      )

      // Stash the scenario's declared displays for the next-run apply
      // effect. We don't apply directly here because the capability
      // might not be available yet (rosbridge disconnected, mock
      // transport, etc.).
      pendingScenarioDisplaysRef.current = spec.displays ?? null
      // A new scenario invalidates any in-memory replay; bail out of
      // replay mode so the renderer stops painting stale frames.
      if (replaySessionRef.current) handleExitReplay()
    },
    [handleExitReplay, onTwistControlBindingsChange, onPublishersChange],
  )

  // Apply scenario-declared displays once the capability is available.
  // Runs on every render where either the pending payload or the
  // capability identity changes; idempotent and resets the ref after
  // a successful apply.
  useEffect(() => {
    if (!renderableTopics) return
    const pending = pendingScenarioDisplaysRef.current
    if (!pending) return
    pendingScenarioDisplaysRef.current = null
    const entries = displaysToRenderableEntries(pending)
    for (const entry of entries) {
      const topicInfo = { name: entry.topicName, type: entry.messageType }
      if (!renderableTopics.isRenderable(topicInfo)) continue
      if (entry.enabled) {
        if (!renderableTopics.isSelected(entry.topicName)) {
          renderableTopics.selectTopic(topicInfo)
        }
        if (Object.keys(entry.style).length > 0) {
          renderableTopics.setVisualConfig(entry.topicName, {
            ...(entry.style.color !== undefined && { color: entry.style.color }),
            ...(entry.style.thickness !== undefined && {
              thickness: entry.style.thickness,
            }),
            ...(entry.style.arrowSize !== undefined && {
              arrowSize: entry.style.arrowSize,
            }),
          })
        }
      } else if (renderableTopics.isSelected(entry.topicName)) {
        renderableTopics.deselectTopic(entry.topicName)
      }
    }
  }, [renderableTopics])

  // Reactive sync: project the live `selectedTopics` snapshot into the
  // editor textarea. The effect intentionally does NOT depend on
  // `currentScenarioText` — re-running on every keystroke would
  // reformat the user's mid-edit text and fight their input. We read
  // the latest text through a ref instead, so sync only fires when the
  // selection itself changes (a click / color / etc.), and bail out:
  //   - silently when the user is typing invalid JSON (helper returns
  //     `ok: false`),
  //   - when the projected output already matches the current text so
  //     React state stays stable across re-renders.
  const currentScenarioTextRef = useRef(currentScenarioText)
  useEffect(() => {
    currentScenarioTextRef.current = currentScenarioText
  }, [currentScenarioText])
  const selectedRenderableTopics = renderableTopics?.selectedTopics
  useEffect(() => {
    if (!selectedRenderableTopics) return
    const text = currentScenarioTextRef.current
    if (text.length === 0) return
    const result = trySyncDisplaysIntoScenarioText(text, selectedRenderableTopics)
    if (!result.ok) return
    if (!result.changed) return
    setCurrentScenarioSpec(result.spec)
    setCurrentScenarioText(result.text)
  }, [selectedRenderableTopics])

  // Mirror of the displays sync above: project the live Twist control
  // bindings into `actions[]` in the editor text. Selecting a Twist
  // topic in the Ros2 Topics panel appears as an enabled action entry;
  // toggling it off persists as `enabled: false`.
  useEffect(() => {
    const text = currentScenarioTextRef.current
    if (text.length === 0) return
    const result = trySyncActionsIntoScenarioText(text, twistControlBindings)
    if (!result.ok) return
    if (!result.changed) return
    setCurrentScenarioSpec(result.spec)
    setCurrentScenarioText(result.text)
  }, [twistControlBindings])

  const handleScenarioTextChange = useCallback((text: string) => {
    setCurrentScenarioText(text)
    setScenarioEditorError(undefined)
  }, [])

  const handleApplyScenario = useCallback(
    (text: string) => {
      const result = parseScenarioJson(text)
      if (!result.ok) {
        setScenarioEditorError(result.error)
        return
      }
      // Reuse the same downstream flow as the dropdown / upload paths
      // so keyboard bindings, replay teardown, and editor state all
      // stay in sync via `handleScenarioLoaded`.
      handleScenarioLoaded(result.spec)
      controller.loadScenarioFromJson(result.spec)
    },
    [controller, handleScenarioLoaded],
  )

  const handleUploadedFileName = useCallback((name: string) => {
    setCurrentScenarioFileName(name)
  }, [])

  const handleScenarioFileNameChange = useCallback((next: string) => {
    setCurrentScenarioFileName(next)
  }, [])

  const handleDownloadScenario = useCallback(
    (text: string) => {
      // Download whatever the user typed — even if it hasn't been
      // applied yet — so they can save WIP edits without having to
      // first commit them to the running simulation.
      downloadScenarioJsonText(text, {
        fileName:
          currentScenarioFileName ??
          normalizeScenarioFileName(currentScenarioSpec?.name ?? '') ??
          'scenario.json',
      })
    },
    [currentScenarioFileName, currentScenarioSpec],
  )

  useEffect(() => {
    return engine.events.on('reset', () => {
      setKeyboardControlState(
        deriveKeyboardControlState(lastInteractionRef.current),
      )
    })
  }, [engine])

  // ----- ROS2 Twist control plumbing ----------------------------------
  //
  // The dropdown in `Ros2TopicsPanel` and the runtime
  // `CommunicationProvider` both read from the same lifted state. We
  // derive a memoized topic→vehicle map for the panel and the option
  // list from the active scenario. UI changes update the lifted state
  // directly; we deliberately do NOT sync those changes back into the
  // Scenario Editor JSON in this iteration. Documented in
  // `doc/Architecture.md` so the on-disk schema can't surprise users
  // who expect their dropdown choice to round-trip.

  const twistControlVehicleOptions = useMemo(
    () =>
      (currentScenarioSpec?.entities ?? [])
        .filter((e) => e.kind === 'vehicle')
        .map((e) => ({ id: e.id, label: e.id })),
    [currentScenarioSpec],
  )

  const twistControlBindingsMap = useMemo<
    Record<string, TwistControlBindingSelection>
  >(() => {
    const map: Record<string, TwistControlBindingSelection> = {}
    for (const b of twistControlBindings) {
      map[b.topic] = {
        vehicleId: b.vehicleId,
        enabled: b.enabled !== false,
      }
    }
    return map
  }, [twistControlBindings])

  // When an external Twist binding stops driving a vehicle (checkbox
  // off, vehicle dropdown cleared, or vehicleId reassigned to another
  // vehicle), the previously-driven vehicle still has the last Twist
  // values stuck on it — `VehicleEntity.setCommand` is sticky. Push a
  // baseline command into the canonical `VehicleCommandQueue` so the
  // next tick restores the scenario's `controls.v / controls.w` (or
  // zeroes if the scenario didn't declare any). We never mutate
  // `VehicleEntity` directly from this layer; the queue is the only
  // sanctioned write path.
  const restoreVehicleBaseline = useCallback(
    (topic: string, vehicleId: string): void => {
      const { command, fromScenarioControls } = buildBaselineVehicleCommand(
        currentScenarioSpec,
        vehicleId,
      )
      commandQueue.push(command)
      engine.logger?.debug(
        `[App] twist deselect → baseline restore: topic="${topic}" ` +
          `vehicleId="${vehicleId}" ` +
          `linearVelocity=${command.linearVelocity} ` +
          `angularVelocity=${command.angularVelocity} ` +
          `fromScenarioControls=${fromScenarioControls}`,
      )
    },
    [currentScenarioSpec, commandQueue, engine.logger],
  )

  const handleTwistControlBindingChange = useCallback(
    (topic: string, vehicleId: string) => {
      const next = [...twistControlBindings]
      const index = next.findIndex((b) => b.topic === topic)
      const previous = index !== -1 ? next[index] : undefined
      const wasEnabled = previous !== undefined && previous.enabled !== false
      if (vehicleId === '') {
        // Empty value means "clear the selected vehicle". A binding
        // without a vehicle cannot drive anything, so dropping it is
        // still appropriate for the dropdown's explicit placeholder.
        if (index !== -1) next.splice(index, 1)
      } else if (index === -1) {
        next.push({ topic, vehicleId, enabled: true })
      } else {
        next[index] = { ...next[index], vehicleId, enabled: true }
      }
      // If we were actively driving a vehicle through this topic, and
      // we're either dropping the binding or pointing it at a
      // different vehicle, restore the previously-driven vehicle so it
      // doesn't keep applying the last Twist command.
      if (
        wasEnabled &&
        previous !== undefined &&
        (vehicleId === '' || vehicleId !== previous.vehicleId)
      ) {
        restoreVehicleBaseline(topic, previous.vehicleId)
      }
      onTwistControlBindingsChange(next)
    },
    [twistControlBindings, onTwistControlBindingsChange, restoreVehicleBaseline],
  )

  const handleTwistControlEnabledChange = useCallback(
    (topic: string, enabled: boolean) => {
      const next = [...twistControlBindings]
      const index = next.findIndex((b) => b.topic === topic)
      if (index === -1) {
        if (!enabled) return
        const vehicleId = twistControlVehicleOptions[0]?.id
        if (!vehicleId) return
        next.push({ topic, vehicleId, enabled: true })
      } else {
        const previous = next[index]
        next[index] = { ...previous, enabled }
        // Transition from enabled to disabled: the bridge will be torn
        // down, but `VehicleEntity` keeps the last commanded velocity.
        // Restore the scenario baseline for that vehicle.
        if (previous.enabled !== false && !enabled) {
          restoreVehicleBaseline(topic, previous.vehicleId)
        }
      }
      onTwistControlBindingsChange(next)
    },
    [
      twistControlBindings,
      twistControlVehicleOptions,
      onTwistControlBindingsChange,
      restoreVehicleBaseline,
    ],
  )

  // ----- inspector resizer --------------------------------------------
  //
  // The user can drag a vertical splitter between the viewport and the
  // inspector to give either side more room. App.tsx owns the width as
  // a single number; the actual clamping math lives in
  // `clampInspectorWidth` (pure helper) so it stays unit-testable.
  const [inspectorWidthPx, setInspectorWidthPx] = useState<number>(
    MIN_INSPECTOR_WIDTH_PX,
  )
  const layoutRef = useRef<HTMLDivElement | null>(null)

  // Re-clamp whenever the window shrinks: an inspector width that
  // was legal at 1920px wide may starve the viewport at 1280px wide.
  useEffect(() => {
    const handleResize = () => {
      const layoutWidth =
        layoutRef.current?.getBoundingClientRect().width ?? 0
      if (layoutWidth <= 0) return
      setInspectorWidthPx((prev) => clampInspectorWidth(prev, layoutWidth))
    }
    handleResize()
    globalThis.addEventListener('resize', handleResize)
    return () => globalThis.removeEventListener('resize', handleResize)
  }, [])

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
        <div
          className="layout"
          ref={layoutRef}
          style={
            {
              '--inspector-width': `${inspectorWidthPx}px`,
            } as React.CSSProperties
          }
        >
          <div className="layout-left">
            <div className="viewport-surface">
              <SimulationViewportSwitcher
                ref={viewportSwitcherRef}
                rendererType={rendererType}
                threeTrajectoryVisualization={trajectoryVisualization}
                phaserTrajectoryVisualization={phaserTrajectoryVisualization}
                debugOverlay={debugOverlayConfig}
                replayState={replayState}
              />
              {showPerformanceOverlay && (
                <PerformanceOverlay
                  updateIntervalMs={performanceOverlayUpdateIntervalMs}
                />
              )}
            </div>
            {isReplayMode && (
              <ReplayTimeline
                frameCount={replayFrameCount}
                currentIndex={replayCurrentIndex}
                durationSec={replayDurationSec}
                currentTimeSec={replayCurrentTimeSec}
                isPlaying={replayIsPlaying}
                speed={replaySpeed}
                onSeekFrame={handleReplaySeekFrame}
                onPlay={handleReplayPlay}
                onPause={handleReplayPause}
                onStepForward={handleReplayStepForward}
                onStepBackward={handleReplayStepBackward}
                onSpeedChange={handleReplaySpeedChange}
                onExit={handleExitReplay}
              />
            )}
          </div>
          <LayoutSplitter
            inspectorWidthPx={inspectorWidthPx}
            onInspectorWidthChange={setInspectorWidthPx}
            layoutRef={layoutRef}
          />
          <aside className="layout-right" aria-label="Inspector">
            <h2 className="layout-title">Inspector</h2>
            <SimulationControlPanel />
            {!scenarioEditorExpanded && !ros2TopicsExpanded && (
              <ConnectionStatusPanel />
            )}
            {/*
              ROS2 Topics is always part of the inspector while
              rosbridge is connected. The card itself short-circuits
              when the transport isn't a connected rosbridge, so this
              JSX is safe to render unconditionally for the
              connection-state matrix. We still hide it when the
              scenario editor takes over the inspector, by symmetry
              with the existing rule.
            */}
            {!scenarioEditorExpanded && (
              <Ros2TopicsPanel
                expanded={ros2TopicsExpanded}
                onExpandedChange={handleRos2TopicsExpandedChange}
                twistControlVehicles={twistControlVehicleOptions}
                twistControlBindings={twistControlBindingsMap}
                onTwistControlBindingChange={handleTwistControlBindingChange}
                onTwistControlEnabledChange={handleTwistControlEnabledChange}
              />
            )}
            {/*
              Live echo cards. One per active session in the topicEcho
              capability. Rendered while connected and not in either
              expanded mode that hides siblings — except when ROS2
              Topics itself is expanded, in which case echo cards are
              the whole point of being expanded and stay visible.
            */}
            {!scenarioEditorExpanded &&
              isTransportConnected &&
              echoSessions.map((session) => (
                <EchoCard
                  key={session.topicName}
                  session={session}
                  canResume={isTransportConnected}
                  onStop={(name) => echo?.stopEcho(name)}
                  onResume={(name) =>
                    echo?.startEcho({
                      name,
                      type: session.topicType,
                    })
                  }
                  onClose={(name) => echo?.closeEcho(name)}
                />
              ))}
            {!scenarioEditorExpanded && !ros2TopicsExpanded && (
              <ControlPanel
                onScenarioLoaded={handleScenarioLoaded}
                onUploadedFileName={handleUploadedFileName}
                recordWhileRunning={recordWhileRunning}
                onRecordWhileRunningChange={handleRecordWhileRunningChange}
                onSaveRecording={handleDownloadRecording}
                saveRecordingDisabled={saveRecordingDisabled}
                saveRecordingDisabledReason={saveRecordingDisabledReason}
              />
            )}
            {!ros2TopicsExpanded && (
              <ScenarioEditorPanel
                scenarioText={currentScenarioText}
                onScenarioTextChange={handleScenarioTextChange}
                onApplyScenario={handleApplyScenario}
                onDownloadScenario={handleDownloadScenario}
                disabledReason={
                  isReplayMode
                    ? 'Editing the scenario is disabled while replay mode is active.'
                    : undefined
                }
                errorMessage={scenarioEditorError}
                expanded={scenarioEditorExpanded}
                onExpandedChange={handleScenarioEditorExpandedChange}
                scenarioFileName={currentScenarioFileName}
                onScenarioFileNameChange={handleScenarioFileNameChange}
              />
            )}
            {/*
              In expanded mode the editor swallows the whole inspector
              column under Simulation Time, so we hide every other
              panel — otherwise their intrinsic heights eat all the
              flex slack and the editor collapses to its header alone
              (`flex: 1 1 auto; min-height: 0` shrinks it to zero when
              the parent overflows). Collapsing the editor restores the
              full inspector layout via React unmount/remount.

              The same rule applies when ROS2 Topics is expanded: only
              the topics card and any echo cards stay rendered, all
              other inspector panels collapse so the list has room.
            */}
            {!scenarioEditorExpanded && !ros2TopicsExpanded && (
              <>
                <RendererPanel
                  rendererType={rendererType}
                  onRendererTypeChange={onRendererTypeChange}
                  motionRuntimeType={motionRuntimeType}
                  onMotionRuntimeTypeChange={onMotionRuntimeTypeChange}
                />
                <MetricsPanel />
                <PerformancePanel
                  showPerformanceOverlay={showPerformanceOverlay}
                  onShowPerformanceOverlayChange={setShowPerformanceOverlay}
                  updateIntervalMs={performanceOverlayUpdateIntervalMs}
                  onUpdateIntervalMsChange={
                    setPerformanceOverlayUpdateIntervalMs
                  }
                />
                <DebugOverlayPanel
                  config={debugOverlayConfig}
                  onChange={setDebugOverlayConfig}
                />
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
                  onTrajectoryDebugEnabledChange={
                    handleTrajectoryDebugEnabledChange
                  }
                  onExportTrajectoryDebug={handleExportTrajectoryDebug}
                  onClearTrajectoryDebug={handleClearTrajectoryDebug}
                  activeRendererType={rendererType}
                  onExportActiveRendererDebug={handleExportRendererDebug}
                  renderDebugEnabled={renderDebugEnabled}
                  onRenderDebugEnabledChange={handleRenderDebugEnabledChange}
                  onExportRenderDebug={handleExportRenderDebug}
                  onClearRenderDebug={handleClearRenderDebug}
                  renderDebugEntryCount={renderDebugEntryCount}
                />
                <RecordingPanel
                  status={recordingStatus}
                  config={recordingConfig}
                  onConfigChange={handleRecordingConfigChange}
                  onStart={handleStartRecording}
                  onStop={handleStopRecording}
                  onClear={handleClearRecording}
                  onDownload={handleDownloadRecording}
                  disabledReason={
                    isReplayMode ? REPLAY_DISABLED_REASON : undefined
                  }
                />
                <section className="panel replay-load" aria-label="Replay">
                  <h2>Replay</h2>
                  <p className="renderer-settings-hint">
                    Load a downloaded <code>.angy-replay.json</code> file
                    to scrub the recorded simulation. Loading a replay
                    pauses the live engine; press{' '}
                    <strong>Exit replay</strong> on the timeline to
                    return to live mode.
                  </p>
                  <div className="renderer-settings-actions">
                    <ReplayLoadButton
                      onLoaded={handleReplayLoaded}
                      onError={handleReplayLoadError}
                      disabledReason={
                        isReplayMode
                          ? 'Already in replay mode. Exit first to load a different file.'
                          : undefined
                      }
                    />
                  </div>
                  {replayError && (
                    <p className="error" role="alert">
                      {replayError}
                    </p>
                  )}
                </section>
                <EntityListPanel />
              </>
            )}
          </aside>
        </div>
      </main>
    </>
  )
}

function computeSaveRecordingDisabledReason({
  isRunning,
  isReplayMode,
  frameCount,
}: {
  isRunning: boolean
  isReplayMode: boolean
  frameCount: number
}): string | undefined {
  if (isRunning) return 'Pause the simulation before saving the recording.'
  if (isReplayMode) return 'Exit replay mode before saving a new recording.'
  if (frameCount === 0) return 'No recorded frames yet — start recording first.'
  return undefined
}
