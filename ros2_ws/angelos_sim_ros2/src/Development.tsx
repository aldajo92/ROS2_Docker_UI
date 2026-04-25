import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei'
import * as THREE from 'three'
import {
  WorldFrame,
  Ground,
  OriginMarker,
  WorldAxes,
  Obstacle,
  Car,
  OBSTACLES,
  worldToScene,
  type CarState,
} from './world'
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

interface SimCellProps {
  label: string
  children?: React.ReactNode
}

function SimCell({ label, children }: SimCellProps) {
  return (
    <div className="dev-grid-cell">
      <Canvas shadows camera={{ position: [12, 18, 12], fov: 50 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <WorldFrame>
          <Ground />
          {children}
        </WorldFrame>
        <gridHelper args={[30, 30, '#444', '#333']} />
        <OrbitControls makeDefault />
      </Canvas>
      <div className="dev-grid-label">{label}</div>
    </div>
  )
}

// --- Sim 3: camera-preset preview ---------------------------------------
// Multiple canonical viewpoints all aimed at a parked car at the world
// origin. Useful as a reference when iterating on camera logic.

type CarCamView = 'orbit' | 'top' | 'front' | 'side' | 'rear'

interface CarCamPreset {
  // Camera position in world (x, y, z).
  pos: [number, number, number]
  // Camera "up" direction in world (x, y, z). Top-down needs a non-Z
  // up so the car still looks "forward up" on screen.
  up: [number, number, number]
}

const CAR_CAM_PRESETS: Record<CarCamView, CarCamPreset> = {
  orbit: { pos: [3, 3, 2.5], up: [0, 0, 1] },
  top: { pos: [0, 0, 6], up: [1, 0, 0] },
  front: { pos: [3, 0, 1.2], up: [0, 0, 1] },
  side: { pos: [0, 3, 1.2], up: [0, 0, 1] },
  rear: { pos: [-3, 0, 1.2], up: [0, 0, 1] },
}

const CAR_CAM_TARGET: [number, number, number] = [0, 0, 0.15]

// Four reference obstacles framing the car at ±2 m on each axis. They
// give the camera presets some scale and parallax to inspect.
const CAR_CAM_OBSTACLES: ReadonlyArray<readonly [number, number]> = [
  [2, 2],
  [-2, 2],
  [-2, -2],
  [2, -2],
]

// Inverse of `worldToScene`: scene (x, y, z) -> world (x, y, z).
// Used by the HUD to display camera coordinates in the same frame as
// the rest of the simulation.
function sceneToWorld(
  sx: number,
  sy: number,
  sz: number,
): [number, number, number] {
  return [sx, -sz, sy]
}

// Live camera HUD. Samples the camera + OrbitControls target a few
// times per second and writes the result imperatively to a DOM ref to
// avoid triggering React renders on every frame.
function CarCamHud({
  hudRef,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef,
}: {
  hudRef: React.RefObject<HTMLDivElement | null>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.RefObject<any>
}) {
  const { camera } = useThree()
  const tick = useRef(0)

  useFrame(() => {
    tick.current = (tick.current + 1) % 6
    if (tick.current !== 0) return
    const node = hudRef.current
    if (!node) return

    const cam = camera as THREE.Camera & {
      isOrthographicCamera?: boolean
      isPerspectiveCamera?: boolean
      fov?: number
      zoom?: number
    }
    const [px, py, pz] = sceneToWorld(
      camera.position.x,
      camera.position.y,
      camera.position.z,
    )
    let tx = 0
    let ty = 0
    let tz = 0
    const target = controlsRef.current?.target as THREE.Vector3 | undefined
    if (target) {
      ;[tx, ty, tz] = sceneToWorld(target.x, target.y, target.z)
    }
    const proj = cam.isOrthographicCamera ? 'ortho' : 'persp'
    const lens = cam.isOrthographicCamera
      ? `zoom=${(cam.zoom ?? 1).toFixed(1)}`
      : `fov=${(cam.fov ?? 0).toFixed(0)}°`
    const fmt = (n: number) => n.toFixed(2)

    node.textContent =
      `proj  ${proj}  ${lens}\n` +
      `pos   (${fmt(px)}, ${fmt(py)}, ${fmt(pz)})\n` +
      `look  (${fmt(tx)}, ${fmt(ty)}, ${fmt(tz)})`
  })

  return null
}

// One-shot camera setter. On every `view` change it snaps the camera to
// the matching preset; nothing else touches the camera, so OrbitControls
// (when active) can take over from there.
function CarCamRig({ view }: { view: CarCamView }) {
  const { camera } = useThree()
  useEffect(() => {
    const preset = CAR_CAM_PRESETS[view]
    camera.position.set(...worldToScene(...preset.pos))
    camera.up.set(...worldToScene(...preset.up))
    camera.lookAt(...worldToScene(...CAR_CAM_TARGET))
    camera.updateProjectionMatrix()
  }, [view, camera])
  return null
}

const CAR_CAM_BUTTONS: Array<{ id: CarCamView; label: string }> = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'rear', label: 'Rear' },
]

type CarCamProjection = 'perspective' | 'orthographic'

const CAR_CAM_PROJECTION_BUTTONS: Array<{
  id: CarCamProjection
  label: string
}> = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'orthographic', label: 'Orthographic' },
]

function CarCamSimCell() {
  const [view, setView] = useState<CarCamView>('orbit')
  const [projection, setProjection] = useState<CarCamProjection>('perspective')
  const hudRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null)

  return (
    <div className="dev-grid-cell">
      <Canvas shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <WorldFrame>
          <Ground />
          <OriginMarker />
          {CAR_CAM_OBSTACLES.map(([x, y], i) => (
            <Obstacle key={i} x={x} y={y} />
          ))}
          <Car state={PARKED_CAR} />
        </WorldFrame>
        <gridHelper args={[30, 30, '#444', '#333']} />
        {/* Camera. `key` forces a fresh mount on projection toggle so
            drei re-registers it as the default; `CarCamRig` then snaps
            it to the current preset on the next effect run. The ortho
            zoom is tuned so a ±2.5 m region (car + corner obstacles)
            roughly fills a quarter-screen cell. */}
        {projection === 'perspective' ? (
          <PerspectiveCamera
            key="perspective"
            makeDefault
            fov={50}
            near={0.1}
            far={1000}
          />
        ) : (
          <OrthographicCamera
            key="orthographic"
            makeDefault
            zoom={80}
            near={0.1}
            far={1000}
          />
        )}
        <CarCamRig view={view} />
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
        <CarCamHud hudRef={hudRef} controlsRef={controlsRef} />
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
          {CAR_CAM_PROJECTION_BUTTONS.map(b => (
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
      <SimCell label="Sim 1">
        {OBSTACLES.map(([x, y], i) => (
          <Obstacle key={i} x={x} y={y} />
        ))}
        <Car state={PARKED_CAR} />
      </SimCell>
      {/* Sim 2 isolates the world-axis arrows (X = red, Y = green,
          Z = blue) on top of the origin marker, so you can study the
          frame convention without any other clutter. */}
      <SimCell label="Sim 2">
        <OriginMarker />
        <WorldAxes length={1.0} />
      </SimCell>
      <CarCamSimCell />
      <SimCell label="Sim 4" />
      <Link className="dev-grid-back" to="/">← Back</Link>
    </div>
  )
}

export default Development
