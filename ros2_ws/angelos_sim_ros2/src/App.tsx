import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { SimTickProvider, useSimTick, useSimTickIncrement } from './useSimTick'
import VelocityChart from './VelocityChart'
import {
  GROUND_SIZE,
  CAR_RADIUS,
  WorldAxes,
  OriginMarker,
  Car,
  Trail,
} from './scene/world'
import type { CarState } from './models/CarState'
import {
  OBSTACLES,
  OBSTACLE_RADIUS,
  Obstacles,
} from './scene/obstacles'
import { SimScene } from './scene/SimScene'
import { ProjectionCamera, type Projection } from './scene/cameras'
import { Point2D, Point3D, distance, scale, sub } from './models/SimBase'
import {
  pointToSceneTuple,
  pointToSceneVector3,
  pointToVector3,
  sceneVector3ToPoint3D,
} from './models/SimMappers'
import './App.css'

const DT = 1 / 60
const MAX_TRAIL = 500
// Four corners of the ground plane, expressed in WORLD coords. The
// orthographic-fit code wants them in scene space, so we cache that
// projection once via the shared world->scene mapper instead of
// constructing THREE.Vector3 instances by hand.
const FIT_HALF = GROUND_SIZE / 2
const FIT_CORNERS_WORLD: ReadonlyArray<Point3D> = [
  new Point3D(-FIT_HALF, -FIT_HALF, 0),
  new Point3D(FIT_HALF, -FIT_HALF, 0),
  new Point3D(-FIT_HALF, FIT_HALF, 0),
  new Point3D(FIT_HALF, FIT_HALF, 0),
]
const FIT_POINTS_SCENE: ReadonlyArray<THREE.Vector3> =
  FIT_CORNERS_WORLD.map(pointToSceneVector3)
// Multiplicative margin so the plane never sits flush against the canvas
// edges after a P toggle.
const ORTHO_FIT_MARGIN = 1.05
// Shared "no collision" set. Reused across frames so React's `Object.is`
// bail-out kicks in and `CarSimScene` doesn't re-render every frame
// while the car is in open space. Treat as immutable.
const EMPTY_COLLIDED_SET: ReadonlySet<number> = new Set()

// Wrap an angle (radians) into the canonical range [-π, π).
function wrapAngle(a: number): number {
  const twoPi = 2 * Math.PI
  let x = ((a + Math.PI) % twoPi + twoPi) % twoPi
  return x - Math.PI
}

function useKeyboard() {
  const keys = useRef(new Set<string>())

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase())
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return keys
}

type CamMode = 'orbit' | 'follow' | 'follow-rotate'

function CameraFollower({
  state,
  mode,
  resetKey,
  frozen,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef,
}: {
  state: CarState
  mode: CamMode
  resetKey: number
  frozen: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.RefObject<any>
}) {
  const { camera, size } = useThree()
  const initialized = useRef(false)
  const prevCar = useRef<Point2D>(new Point2D(0, 0))
  const prevMode = useRef<CamMode>(mode)
  const forceInit = useRef(false)
  // Last known orbit camera pose, kept in WORLD coords so we own a
  // single canonical representation. Updated every frame the user is
  // in orbit mode and consulted when re-entering orbit (after C/X) so
  // the user gets back the view they were looking at, not the
  // hardcoded default. V explicitly clears this so it always resets
  // cleanly. (`up` is a direction, not a position; storing it as a
  // Point3D works because our world<->scene transform is a proper
  // rotation, so it maps directions correctly too.)
  const savedOrbitPose = useRef<{
    position: Point3D
    target: Point3D
    up: Point3D
  } | null>(null)

  // Explicit user-driven reset (V): re-initialize for the current mode
  // and forget any saved orbit pose so the next C/X cycle starts clean.
  useEffect(() => {
    forceInit.current = true
    savedOrbitPose.current = null
  }, [resetKey])

  // Camera-object change (projection swap inside follow modes, or the
  // initial mount) re-runs the init block but must NOT discard the
  // saved orbit pose.
  useEffect(() => {
    forceInit.current = true
    camera.up.set(0, 1, 0)
  }, [camera])

  useFrame(() => {
    // Frozen: skip every camera-position update. Mode/reset events that
    // arrived while frozen are deferred until the user unfreezes.
    if (frozen) return

    const controls = controlsRef.current
    const cam = camera as THREE.Camera & {
      isPerspectiveCamera?: boolean
      isOrthographicCamera?: boolean
      zoom?: number
      updateProjectionMatrix?: () => void
    }

    // While the user is actively in orbit mode, continuously checkpoint
    // the camera pose so we can restore it on re-entry. This is what
    // makes "press C twice" return you to the same orbit view you had,
    // instead of the hardcoded default. The pose is stored as world-
    // coord Point3D triples; `sceneVector3ToPoint3D` does the inverse
    // tilt for us.
    if (
      mode === 'orbit' &&
      prevMode.current === 'orbit' &&
      !forceInit.current &&
      controls?.target
    ) {
      savedOrbitPose.current = {
        position: sceneVector3ToPoint3D(camera.position),
        target: sceneVector3ToPoint3D(controls.target as THREE.Vector3),
        up: sceneVector3ToPoint3D(camera.up),
      }
    }

    // Entering a new mode (or after a forced reset): set up the camera
    // for that mode once, so the per-frame logic below only has to
    // maintain the chosen pose. We also size the orthographic frustum
    // here, which requires a fully up-to-date camera world matrix —
    // hence doing all camera-pose work for orbit mode in this block,
    // not in the per-frame fallthrough below.
    if (prevMode.current !== mode || forceInit.current) {
      const enteringOrbit = mode === 'orbit' && prevMode.current !== 'orbit'

      if (mode === 'follow') {
        // Put the camera 12 units above the car in world coords and look
        // straight down; OrbitControls handles pan + zoom from there.
        camera.position.set(...pointToSceneTuple(new Point3D(state.x, state.y, 12)))
        // "Up on screen" should be world +Y.
        camera.up.set(...pointToSceneTuple(new Point3D(0, 1, 0)))
        if (controls) {
          controls.target.set(...pointToSceneTuple(new Point2D(state.x, state.y)))
          controls.update()
        }
        prevCar.current = new Point2D(state.x, state.y)
      } else if (mode === 'follow-rotate') {
        camera.position.set(...pointToSceneTuple(new Point3D(state.x, state.y, 12)))
        camera.lookAt(...pointToSceneTuple(new Point2D(state.x, state.y)))
        camera.up.set(
          ...pointToSceneTuple(
            new Point2D(Math.cos(state.yaw), Math.sin(state.yaw)),
          ),
        )
      } else if (enteringOrbit && savedOrbitPose.current) {
        // Returning to orbit from another mode — restore exactly the
        // camera pose the user last had in orbit (position + target +
        // up). V would have cleared savedOrbitPose, so V still resets
        // cleanly to the default below. The cached pose is in world
        // coords, so each component is mapped back through worldToScene.
        camera.position.copy(pointToSceneVector3(savedOrbitPose.current.position))
        camera.up.copy(pointToSceneVector3(savedOrbitPose.current.up))
        if (controls) {
          controls.target.copy(pointToSceneVector3(savedOrbitPose.current.target))
          controls.update()
        }
      } else {
        camera.position.set(
          ...pointToSceneTuple(new Point3D(state.x + 5, state.y + 5, 8)),
        )
        camera.up.set(0, 1, 0)
        camera.lookAt(...pointToSceneTuple(new Point2D(state.x, state.y)))
        if (controls) {
          controls.target.set(...pointToSceneTuple(new Point2D(state.x, state.y)))
          controls.update()
        }
      }
      initialized.current = true

      // If the active camera is orthographic (e.g. just toggled via P),
      // pick the zoom that exactly fits the ground-plane corners with a
      // small margin. Geometry, no heuristics:
      //   1. Project each corner into camera-local space using the
      //      camera's inverse world matrix.
      //   2. The corner with the largest |x| / |y| in that frame is the
      //      one closest to the screen edge.
      //   3. Drei sizes the ortho frustum as
      //        left/right = ±size.width/2, top/bottom = ±size.height/2
      //      (in pixels), divided by zoom. So the visible world half-
      //      width is `size.width / (2 * zoom)` and the visible world
      //      half-height is `size.height / (2 * zoom)`.
      //   4. Pick the zoom that makes both corner-extents fit, then
      //      shrink it slightly so the plane has breathing room.
      if (cam.isOrthographicCamera && size.height > 0 && size.width > 0) {
        camera.updateMatrixWorld(true)
        const invMatrix = new THREE.Matrix4()
          .copy(camera.matrixWorld)
          .invert()
        // Scratch buffer for the inv-matrix multiply below. Allocated
        // via the mapper so this file never constructs THREE.Vector3
        // directly; the value (origin) is irrelevant — it's overwritten
        // by `.copy(corner)` on every iteration.
        const localCorner = pointToVector3(new Point3D(0, 0, 0))
        let maxLocalX = 0
        let maxLocalY = 0
        for (const corner of FIT_POINTS_SCENE) {
          localCorner.copy(corner).applyMatrix4(invMatrix)
          const ax = Math.abs(localCorner.x)
          const ay = Math.abs(localCorner.y)
          if (ax > maxLocalX) maxLocalX = ax
          if (ay > maxLocalY) maxLocalY = ay
        }
        if (maxLocalX > 0 && maxLocalY > 0) {
          const zoomX = size.width / (2 * maxLocalX * ORTHO_FIT_MARGIN)
          const zoomY = size.height / (2 * maxLocalY * ORTHO_FIT_MARGIN)
          cam.zoom = Math.min(zoomX, zoomY)
          cam.updateProjectionMatrix?.()
        }
      }
      prevMode.current = mode
      forceInit.current = false
    }

    if (mode === 'follow') {
      // Translate the camera + orbit target by the car's world-space
      // displacement so the user's current zoom/pan offset is preserved.
      const dx = state.x - prevCar.current.x
      const dy = state.y - prevCar.current.y
      if (dx !== 0 || dy !== 0) {
        const [sdx, , sdz] = pointToSceneTuple(new Point2D(dx, dy))
        camera.position.x += sdx
        camera.position.z += sdz
        if (controls) {
          controls.target.x += sdx
          controls.target.z += sdz
          controls.update()
        }
        prevCar.current = new Point2D(state.x, state.y)
      }
    } else if (mode === 'follow-rotate') {
      camera.position.set(...pointToSceneTuple(new Point3D(state.x, state.y, 12)))
      camera.lookAt(...pointToSceneTuple(new Point2D(state.x, state.y)))
      camera.up.set(
        ...pointToSceneTuple(
          new Point2D(Math.cos(state.yaw), Math.sin(state.yaw)),
        ),
      )
    }
  })

  return null
}

// The full car simulation: physics, collisions, follow-cameras, key
// bindings. Composes the shared `SimScene` for the static scaffolding
// (lights + ground + grid) and adds the car-specific objects on top.
function CarSimScene({
  onHudUpdate,
  cameraLocked,
  cameraFrozen,
}: {
  onHudUpdate: (h: CarState) => void
  cameraLocked: boolean
  cameraFrozen: boolean
}) {
  const keys = useKeyboard()
  const tickIncrement = useSimTickIncrement()
  const stateRef = useRef<CarState>({ x: 0, y: 0, yaw: 0, v: 0, w: 0, colliding: false })
  const trailRef = useRef<Point3D[]>([])
  const [trail, setTrail] = useState<Point3D[]>([])
  const [collidedSet, setCollidedSet] =
    useState<ReadonlySet<number>>(EMPTY_COLLIDED_SET)
  // Bitmask of currently colliding obstacles (1 bit per obstacle index).
  // Used to detect actual changes in collision state cheaply, without
  // allocating a Set every frame just to compare.
  const hitMaskRef = useRef(0)
  const [camMode, setCamMode] = useState<CamMode>('orbit')
  const [camProjection, setCamProjection] = useState<Projection>('perspective')
  const [camResetKey, setCamResetKey] = useState(0)

  // The default (orbit) camera is always perspective. If the user was in
  // ortho inside a follow mode and then switches back to orbit (via C, X
  // or V), snap projection back to perspective.
  useEffect(() => {
    if (camMode === 'orbit' && camProjection !== 'perspective') {
      setCamProjection('perspective')
      setCamResetKey(k => k + 1)
    }
  }, [camMode, camProjection])
  const cWasDown = useRef(false)
  const xWasDown = useRef(false)
  const vWasDown = useRef(false)
  const pWasDown = useRef(false)
  const frameCount = useRef(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null)

  const update = useCallback(() => {
    const s = stateRef.current
    const k = keys.current

    let cmdV = 0
    let cmdW = 0
    if (k.has('i') || k.has('arrowup')) cmdV = 1.0
    if (k.has(',') || k.has('arrowdown')) cmdV = -0.5
    if (k.has('j') || k.has('arrowleft')) cmdW = 0.7
    if (k.has('l') || k.has('arrowright')) cmdW = -0.7
    if (k.has('u')) { cmdV = 1.0; cmdW = 0.7 }
    if (k.has('o')) { cmdV = 1.0; cmdW = -0.7 }

    s.yaw = wrapAngle(s.yaw + cmdW * DT)
    s.x += cmdV * Math.cos(s.yaw) * DT
    s.y += cmdV * Math.sin(s.yaw) * DT
    s.v = cmdV
    s.w = cmdW

    const carPos = new Point2D(s.x, s.y)
    const minDist = CAR_RADIUS + OBSTACLE_RADIUS
    // Track collisions via a bitmask first (no allocation). The Set is
    // only built when the mask differs from the previous frame, i.e.
    // when an obstacle starts or stops colliding. This is what keeps
    // React from re-rendering the whole CarSimScene every frame.
    let mask = 0
    let hits: number[] | null = null
    for (let i = 0; i < OBSTACLES.length; i++) {
      const obs = OBSTACLES[i]
      const d = distance(carPos, obs)
      if (d < minDist) {
        const overlap = minDist - d
        // Push the car along the (car - obs) direction, scaled by the
        // overlap. `sub` and `scale` return Point3D (z = 0 here), so we
        // only consume the planar components.
        const push = scale(sub(carPos, obs), overlap / d)
        s.x += push.x
        s.y += push.y
        s.v = 0
        mask |= 1 << i
        if (hits === null) hits = []
        hits.push(i)
      }
    }
    s.colliding = mask !== 0
    if (mask !== hitMaskRef.current) {
      hitMaskRef.current = mask
      setCollidedSet(mask === 0 ? EMPTY_COLLIDED_SET : new Set(hits!))
    }

    // Trail is authored in world coords; it lives inside WorldFrame.
    trailRef.current.push(new Point3D(s.x, s.y, 0.02))
    if (trailRef.current.length > MAX_TRAIL) trailRef.current.shift()
  }, [keys])

  useFrame(() => {
    update()
    tickIncrement()

    const cDown = keys.current.has('c')
    if (cDown && !cWasDown.current) setCamMode(prev => prev === 'follow' ? 'orbit' : 'follow')
    cWasDown.current = cDown

    const xDown = keys.current.has('x')
    if (xDown && !xWasDown.current) setCamMode(prev => prev === 'follow-rotate' ? 'orbit' : 'follow-rotate')
    xWasDown.current = xDown

    // "V" always returns the camera to the default orbit pose, regardless
    // of the previous mode (useful to recover after C or X).
    const vDown = keys.current.has('v')
    if (vDown && !vWasDown.current) {
      setCamMode('orbit')
      setCamResetKey(k => k + 1)
    }
    vWasDown.current = vDown

    // "P" toggles between perspective and orthographic projection, but
    // ONLY in the follow / follow-rotate modes. The default (orbit)
    // camera is always perspective — orthographic doesn't make sense
    // for a free-orbiting tilted view of a large ground plane.
    const pDown = keys.current.has('p')
    if (pDown && !pWasDown.current && camMode !== 'orbit') {
      setCamProjection(prev => (prev === 'perspective' ? 'orthographic' : 'perspective'))
      setCamResetKey(k => k + 1)
    }
    pWasDown.current = pDown

    frameCount.current++
    if (frameCount.current % 3 === 0) {
      setTrail([...trailRef.current])
      const s = stateRef.current
      onHudUpdate({ ...s })
    }
  })

  return (
    <>
      <SimScene lightPosition={new Point3D(10, 15, 10)} castShadow>
        <OriginMarker />
        <WorldAxes length={1.0} />
        <Obstacles positions={OBSTACLES} hits={collidedSet} />
        <Trail points={trail} />
        <Car state={stateRef.current} />
      </SimScene>

      {/* Active camera. drei's `makeDefault` registers it as the camera
          returned by `useThree()`, so OrbitControls and CameraFollower
          automatically pick up the current projection on toggle. The
          ortho zoom here is just an initial value; CameraFollower fits
          the ground plane on the first frame after a P toggle. */}
      <ProjectionCamera projection={camProjection} fov={50} zoom={40} />

      <CameraFollower
        state={stateRef.current}
        mode={camMode}
        resetKey={camResetKey}
        frozen={cameraFrozen}
        controlsRef={controlsRef}
      />
      {/* Remount OrbitControls when the projection changes so it binds to
          the new active camera instead of the previous one. */}
      <OrbitControls
        key={camProjection}
        ref={controlsRef}
        enabled={!cameraLocked && (camMode === 'orbit' || camMode === 'follow')}
        enableRotate={camMode === 'orbit'}
        enableZoom
        enablePan
      />
    </>
  )
}

function Dashboard({ hud }: { hud: CarState }) {
  const tickSim = useSimTick()
  const simTime = (tickSim * DT).toFixed(2)

  return (
    <div className="split-right">
      <h1>Vite + React</h1>
      <div className="card">
        <p>tickSim: {tickSim}</p>
        <p>Sim time: {simTime}s</p>
      </div>
      <VelocityChart velocity={hud.v} />
    </div>
  )
}

function App() {
  const [hud, setHud] = useState<CarState>({ x: 0, y: 0, yaw: 0, v: 0, w: 0, colliding: false })
  const [cameraLocked, setCameraLocked] = useState(false)
  const [cameraFrozen, setCameraFrozen] = useState(false)

  return (
    <SimTickProvider>
      <div className="split-layout">
        <div className="split-left">
          <Canvas shadows>
            <CarSimScene
              onHudUpdate={setHud}
              cameraLocked={cameraLocked}
              cameraFrozen={cameraFrozen}
            />
          </Canvas>
          <div className="hud">
            <span>v = {hud.v.toFixed(2)} m/s</span>
            <span>w = {(hud.w * 180 / Math.PI).toFixed(1)} °/s</span>
            <span>pos = ({hud.x.toFixed(2)}, {hud.y.toFixed(2)})</span>
            <span>yaw = {(hud.yaw * 180 / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="cam-toolbar">
            <button
              className="cam-btn"
              type="button"
              title={
                'Controls\n' +
                '\n' +
                'IJKL / Arrows  drive\n' +
                'C   top-down follow\n' +
                'X   rotating follow\n' +
                'V   reset camera\n' +
                'P   perspective / orthographic (follow modes only)\n' +
                '\n' +
                'Mouse: left-drag = orbit, scroll = zoom, right-drag = pan'
              }
              aria-label="Show controls"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            <button
              className={`cam-btn ${cameraLocked ? 'active' : ''}`}
              onClick={() => setCameraLocked(prev => !prev)}
              title={cameraLocked
                ? 'Unlock camera (re-enable mouse interactions)'
                : 'Lock camera (disable mouse interactions)'}
              aria-label={cameraLocked ? 'Unlock camera interactions' : 'Lock camera interactions'}
            >
              {cameraLocked ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0" />
                </svg>
              )}
            </button>
            <button
              className={`cam-btn ${cameraFrozen ? 'active' : ''}`}
              onClick={() => setCameraFrozen(prev => !prev)}
              title={cameraFrozen
                ? 'Unfreeze camera (resume auto follow / mode updates)'
                : 'Freeze camera (stop all programmatic camera movement)'}
              aria-label={cameraFrozen ? 'Unfreeze camera' : 'Freeze camera'}
            >
              {/* Pin / thumbtack — denotes "camera pinned in place" */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v6" />
                <path d="M9 8h6l1 6H8z" />
                <path d="M12 14v8" />
              </svg>
            </button>
          </div>
        </div>
        <Dashboard hud={hud} />
      </div>
    </SimTickProvider>
  )
}

export default App
