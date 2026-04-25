import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import {
  OriginMarker,
  WorldAxes,
  Car,
  worldToScene,
  type CarState,
} from './scene/world'
import { OBSTACLES, Obstacles } from './scene/obstacles'
import { SimScene, SimSceneCell } from './scene/SimScene'
import {
  CAR_CAM_BUTTONS,
  CAR_CAM_PRESETS,
  CAR_CAM_TARGET,
  CameraHud,
  PROJECTION_BUTTONS,
  PresetCameraRig,
  ProjectionCamera,
  type CarCamView,
  type Projection,
} from './scene/cameras'
import './App.css'

// A stationary car pose used by the preview cells. The shared `Car`
// component reads from a CarState ref every frame, so we hand it a
// frozen state at the world origin.
const PARKED_CAR: CarState = {
  x: 0,
  y: 0,
  yaw: 0,
  v: 0,
  w: 0,
  colliding: false,
}

// Four reference obstacles framing the car at ±2 m on each axis. They
// give the camera presets some scale and parallax to inspect.
const CAR_CAM_OBSTACLES: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [-2, 2],
  [-2, -2],
  [2, -2],
]

// --- Sim 3: camera-preset preview ---------------------------------------
// Multiple canonical viewpoints all aimed at a parked car at the world
// origin. The camera primitives (preset rig, projection switcher, HUD)
// live in `./cameras.tsx` so other cells can reuse them too.
function CarCamSimCell() {
  const [view, setView] = useState<CarCamView>('orbit')
  const [projection, setProjection] = useState<Projection>('perspective')
  const hudRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null)

  return (
    <div className="dev-grid-cell">
      <Canvas shadows>
        <SimScene>
          <OriginMarker />
          <Obstacles positions={CAR_CAM_OBSTACLES} />
          <Car state={PARKED_CAR} />
        </SimScene>
        <ProjectionCamera projection={projection} fov={50} zoom={80} />
        <PresetCameraRig
          preset={CAR_CAM_PRESETS[view]}
          target={CAR_CAM_TARGET}
          presetKey={`${view}-${projection}`}
        />
        {/* Pan + zoom are always available so you can inspect the car
            from any preset; rotation is reserved for `orbit`, otherwise
            fixed views would drift off-axis. Keyed on view+projection
            so the controls remount cleanly when either changes and pick
            up the new active camera + reset their target. */}
        <OrbitControls
          ref={controlsRef}
          key={`${view}-${projection}`}
          makeDefault
          target={worldToScene(...CAR_CAM_TARGET)}
          enableRotate={view === 'orbit'}
          enablePan
          enableZoom
        />
        <CameraHud hudRef={hudRef} controlsRef={controlsRef} />
      </Canvas>
      <div className="dev-grid-label">Sim 3 — Car cameras</div>
      <div ref={hudRef} className="dev-cam-info" />
      <div className="dev-cam-bar">
        <div className="dev-cam-row">
          {CAR_CAM_BUTTONS.map(b => (
            <button
              key={b.id}
              type="button"
              className={`dev-cam-btn ${view === b.id ? 'active' : ''}`}
              onClick={() => setView(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="dev-cam-row">
          {PROJECTION_BUTTONS.map(b => (
            <button
              key={b.id}
              type="button"
              className={`dev-cam-btn ${projection === b.id ? 'active' : ''}`}
              onClick={() => setProjection(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Development() {
  return (
    <div className="dev-grid">
      {/* Sim 1 mirrors the solid objects in the main app: the static
          obstacle layout and a stationary car at the spawn pose. No
          physics — this view is a static snapshot for experimentation. */}
      <SimSceneCell label="Sim 1">
        <Obstacles positions={OBSTACLES} />
        <Car state={PARKED_CAR} />
      </SimSceneCell>
      {/* Sim 2 isolates the world-axis arrows (X = red, Y = green,
          Z = blue) on top of the origin marker, so you can study the
          frame convention without any other clutter. */}
      <SimSceneCell label="Sim 2">
        <OriginMarker />
        <WorldAxes length={1.0} />
      </SimSceneCell>
      <CarCamSimCell />
      <SimSceneCell label="Sim 4" />
      <Link className="dev-grid-back" to="/">← Back</Link>
    </div>
  )
}

export default Development
