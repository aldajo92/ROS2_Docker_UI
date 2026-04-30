import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SimulationProvider } from './SimulationProvider'
import { useSimulation, useSimulationRunning } from './useSimulation'
import { ControlPanel } from '../ui/ControlPanel'
import { RendererPanel } from '../ui/RendererPanel'
import { SimulationTimeDisplay } from '../ui/SimulationTimeDisplay'
import { EntityListPanel } from '../ui/EntityListPanel'
import { MetricsPanel } from '../ui/MetricsPanel'
import { RendererSettingsPanel } from '../ui/RendererSettingsPanel'
import { RecordingPanel } from '../ui/RecordingPanel'
import { downloadReplay } from '../ui/replay/ReplayFileDownloader'
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

export default function App() {
  return (
    <SimulationProvider>
      <AppShell />
    </SimulationProvider>
  )
}

function AppShell() {
  const { engine, controller } = useSimulation()
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

  const handleScenarioLoaded = useCallback(
    (spec: ScenarioSpec) => {
      lastInteractionRef.current = spec.interaction
      setKeyboardControlState(deriveKeyboardControlState(spec.interaction))
      // A new scenario invalidates any in-memory replay; bail out of
      // replay mode so the renderer stops painting stale frames.
      if (replaySessionRef.current) handleExitReplay()
    },
    [handleExitReplay],
  )

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
              replayState={replayState}
            />
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
          <aside className="layout-right" aria-label="Inspector">
            <h2 className="layout-title">Inspector</h2>
            <ControlPanel
              onScenarioLoaded={handleScenarioLoaded}
              recordWhileRunning={recordWhileRunning}
              onRecordWhileRunningChange={handleRecordWhileRunningChange}
              onSaveRecording={handleDownloadRecording}
              saveRecordingDisabled={saveRecordingDisabled}
              saveRecordingDisabledReason={saveRecordingDisabledReason}
            />
            <RendererPanel
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
                Load a downloaded <code>.angy-replay.json</code> file to
                scrub the recorded simulation. Loading a replay pauses
                the live engine; press <strong>Exit replay</strong> on
                the timeline to return to live mode.
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
