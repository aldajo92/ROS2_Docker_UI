import { useRef, useEffect, useCallback, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line } from '@react-three/drei'
import * as THREE from 'three'
import { SimTickProvider, useSimTick, useSimTickIncrement } from './useSimTick'
import VelocityChart from './VelocityChart'
import './App.css'

const OBSTACLES = [
  [1.6, 2.3],
  [3.0, 3.0],
  [2.0, 7.0],
  [3.0, 5.5],
  [6.0, 4.2],
  [6.0, 8.3],
  [7.0, 1.5],
  [8.0, 6.0],
]

const DT = 1 / 60
const MAX_TRAIL = 500
const CAR_RADIUS = 0.3
const OBSTACLE_RADIUS = 0.15

// --- World frame ---------------------------------------------------------
// The simulation is authored in a ROS/Gazebo-style frame:
//   X forward, Y left, Z up, right-handed (x × y = z).
// three.js uses a Y-up frame. We embed the world frame in the scene by
// wrapping every world-space object in a single <group rotation={WORLD_TILT}>
// that rotates the world onto three.js:
//   world +X -> three.js +X
//   world +Y -> three.js -Z
//   world +Z -> three.js +Y
// This is a proper rotation (det = +1) so the right-hand rule is preserved
// and components can use (x, y, z) coordinates directly, with no sign
// juggling.
//
// The camera lives outside the <Canvas> scene graph (it's attached to the
// renderer, not to a group), so the few places that talk to the camera
// need to translate a world point to three.js space. `worldToScene` is
// the one and only conversion point.
const WORLD_TILT: [number, number, number] = [-Math.PI / 2, 0, 0]

function worldToScene(x: number, y: number, z: number = 0): [number, number, number] {
  return [x, z, -y]
}

// Wrap an angle (radians) into the canonical range [-π, π).
function wrapAngle(a: number): number {
  const twoPi = 2 * Math.PI
  let x = ((a + Math.PI) % twoPi + twoPi) % twoPi
  return x - Math.PI
}

interface CarState {
  x: number
  y: number
  yaw: number
  v: number
  w: number
  colliding: boolean
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

interface ArrowProps {
  length?: number
  shaftRadius?: number
  tipRadius?: number
  tipLength?: number
  color?: string
}

// Arrow pointing along its local +X axis. Its internals use three.js
// geometry conventions but externally it behaves as a pure "+X arrow",
// so it composes naturally with parent rotations in any frame.
function Arrow({
  length = 0.55,
  shaftRadius = 0.025,
  tipRadius = 0.07,
  tipLength = 0.18,
  color = '#ff3c3c',
}: ArrowProps) {
  const shaftLength = length - tipLength
  const shaftCenter = shaftLength / 2
  const tipCenter = shaftLength + tipLength / 2

  return (
    <group>
      <mesh position={[shaftCenter, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <cylinderGeometry args={[shaftRadius, shaftRadius, shaftLength, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[tipCenter, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[tipRadius, tipLength, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

// All of the following components live INSIDE the world-frame group, so
// they can use world coordinates (x, y on the ground, z up) directly.

function Car({ state }: { state: CarState }) {
  const groupRef = useRef<THREE.Group>(null!)

  useFrame(() => {
    groupRef.current.position.set(state.x, state.y, 0.15)
    groupRef.current.rotation.set(0, 0, state.yaw)
  })

  return (
    <group ref={groupRef}>
      <mesh>
        {/* Dimensions are (x, y, z) in the world frame. */}
        <boxGeometry args={[0.5, 0.3, 0.3]} />
        <meshStandardMaterial color="#00ffff" />
      </mesh>
      <group position={[0.25, 0, 0]}>
        <Arrow length={0.55} />
      </group>
    </group>
  )
}

// Gazebo/ROS convention: X = red, Y = green, Z = blue, right-handed.
function WorldAxes({ length = 1.0 }: { length?: number }) {
  return (
    <group position={[0, 0, 0.02]}>
      <Arrow color="#ff0000" length={length} />
      {/* +X rotated +90° about +Z -> +Y */}
      <group rotation={[0, 0, Math.PI / 2]}>
        <Arrow color="#00cc00" length={length} />
      </group>
      {/* +X rotated -90° about +Y -> +Z */}
      <group rotation={[0, -Math.PI / 2, 0]}>
        <Arrow color="#2a7bff" length={length} />
      </group>
    </group>
  )
}

function Obstacle({ x, y, hit }: { x: number; y: number; hit: boolean }) {
  // `cylinderGeometry` runs along the local Y axis by default; rotate the
  // mesh so its long axis aligns with world +Z (vertical pillar).
  return (
    <mesh position={[x, y, 0.25]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[OBSTACLE_RADIUS, OBSTACLE_RADIUS, 0.5, 16]} />
      <meshStandardMaterial color={hit ? '#ff4444' : '#888'} />
    </mesh>
  )
}

function Ground() {
  // `planeGeometry` sits in the local XY plane facing +Z. Inside the
  // world-frame group that's exactly the world XY ground plane facing up.
  return (
    <mesh position={[0, 0, -0.01]}>
      <planeGeometry args={[30, 30]} />
      <meshStandardMaterial color="#2a2a2a" />
    </mesh>
  )
}

function OriginMarker() {
  return (
    <mesh position={[0, 0, 0.02]}>
      <boxGeometry args={[0.2, 0.2, 0.04]} />
      <meshStandardMaterial color="#50c850" />
    </mesh>
  )
}

function Trail({ points }: { points: [number, number, number][] }) {
  if (points.length < 2) return null
  return <Line points={points} color="#ff5050" lineWidth={2} />
}

// `WorldFrame` is the single place where world <-> scene axis mapping
// happens. Everything inside is authored in world coordinates.
function WorldFrame({ children }: { children: React.ReactNode }) {
  return <group rotation={WORLD_TILT}>{children}</group>
}

type CamMode = 'orbit' | 'follow' | 'follow-rotate'

function CameraFollower({
  state,
  mode,
  resetKey,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef,
}: {
  state: CarState
  mode: CamMode
  resetKey: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  controlsRef: React.RefObject<any>
}) {
  const { camera } = useThree()
  const initialized = useRef(false)
  const prevCar = useRef({ x: 0, y: 0 })
  const prevMode = useRef<CamMode>(mode)

  // Bumping resetKey forces the camera to snap back to its default pose
  // on the next frame (used by the "V" shortcut).
  useEffect(() => {
    initialized.current = false
    camera.up.set(0, 1, 0)
  }, [resetKey, camera])

  useFrame(() => {
    const controls = controlsRef.current

    // Entering a new mode: set up the camera for that mode once, so the
    // per-frame logic below only has to maintain the chosen pose.
    if (prevMode.current !== mode) {
      if (mode === 'follow') {
        // Put the camera 12 units above the car in world coords and look
        // straight down; OrbitControls handles pan + zoom from there.
        camera.position.set(...worldToScene(state.x, state.y, 12))
        // "Up on screen" should be world +Y.
        camera.up.set(...worldToScene(0, 1, 0))
        if (controls) {
          controls.target.set(...worldToScene(state.x, state.y, 0))
          controls.update()
        }
        prevCar.current = { x: state.x, y: state.y }
      }
      prevMode.current = mode
    }

    if (mode === 'follow') {
      // Translate the camera + orbit target by the car's world-space
      // displacement so the user's current zoom/pan offset is preserved.
      const dx = state.x - prevCar.current.x
      const dy = state.y - prevCar.current.y
      if (dx !== 0 || dy !== 0) {
        const [sdx, , sdz] = worldToScene(dx, dy, 0)
        camera.position.x += sdx
        camera.position.z += sdz
        if (controls) {
          controls.target.x += sdx
          controls.target.z += sdz
          controls.update()
        }
        prevCar.current = { x: state.x, y: state.y }
      }
    } else if (mode === 'follow-rotate') {
      camera.position.set(...worldToScene(state.x, state.y, 12))
      camera.lookAt(...worldToScene(state.x, state.y, 0))
      // Up on screen follows the car's heading (world frame).
      camera.up.set(...worldToScene(Math.cos(state.yaw), Math.sin(state.yaw), 0))
    } else if (!initialized.current) {
      camera.position.set(...worldToScene(state.x + 5, state.y + 5, 8))
      camera.lookAt(...worldToScene(state.x, state.y, 0))
      initialized.current = true
    }
  })

  return null
}

function SimScene({ onHudUpdate }: { onHudUpdate: (h: CarState) => void }) {
  const keys = useKeyboard()
  const tickIncrement = useSimTickIncrement()
  const stateRef = useRef<CarState>({ x: 0, y: 0, yaw: 0, v: 0, w: 0, colliding: false })
  const trailRef = useRef<[number, number, number][]>([])
  const [trail, setTrail] = useState<[number, number, number][]>([])
  const [collidedSet, setCollidedSet] = useState<Set<number>>(new Set())
  const [camMode, setCamMode] = useState<CamMode>('orbit')
  const [camResetKey, setCamResetKey] = useState(0)
  const cWasDown = useRef(false)
  const xWasDown = useRef(false)
  const vWasDown = useRef(false)
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

    const minDist = CAR_RADIUS + OBSTACLE_RADIUS
    const hit = new Set<number>()
    for (let i = 0; i < OBSTACLES.length; i++) {
      const dx = s.x - OBSTACLES[i][0]
      const dy = s.y - OBSTACLES[i][1]
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < minDist) {
        const overlap = minDist - dist
        const nx = dx / dist
        const ny = dy / dist
        s.x += nx * overlap
        s.y += ny * overlap
        s.v = 0
        hit.add(i)
      }
    }
    s.colliding = hit.size > 0
    setCollidedSet(hit)

    // Trail is authored in world coords; it lives inside WorldFrame.
    trailRef.current.push([s.x, s.y, 0.02])
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

    frameCount.current++
    if (frameCount.current % 3 === 0) {
      setTrail([...trailRef.current])
      const s = stateRef.current
      onHudUpdate({ ...s })
    }
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 15, 10]} intensity={1} castShadow />

      <WorldFrame>
        <Ground />
        <OriginMarker />
        <WorldAxes length={1.0} />
        {OBSTACLES.map((obs, i) => (
          <Obstacle key={i} x={obs[0]} y={obs[1]} hit={collidedSet.has(i)} />
        ))}
        <Trail points={trail} />
        <Car state={stateRef.current} />
      </WorldFrame>

      {/* gridHelper is already flat (scene XZ = world XY after the tilt),
          and is a pure visual aid, so we keep it outside WorldFrame. */}
      <gridHelper args={[30, 30, '#444', '#333']} />

      <CameraFollower
        state={stateRef.current}
        mode={camMode}
        resetKey={camResetKey}
        controlsRef={controlsRef}
      />
      <OrbitControls
        ref={controlsRef}
        enabled={camMode === 'orbit' || camMode === 'follow'}
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

  return (
    <SimTickProvider>
      <div className="split-layout">
        <div className="split-left">
          <Canvas shadows camera={{ position: worldToScene(5, 5, 8), fov: 50 }}>
            <SimScene onHudUpdate={setHud} />
          </Canvas>
          <div className="hud">
            <span>v = {hud.v.toFixed(2)} m/s</span>
            <span>w = {(hud.w * 180 / Math.PI).toFixed(1)} °/s</span>
            <span>pos = ({hud.x.toFixed(2)}, {hud.y.toFixed(2)})</span>
            <span>yaw = {(hud.yaw * 180 / Math.PI).toFixed(1)}°</span>
          </div>
          <div className="controls-hint">
            IJKL / Arrow keys to drive — C: top-down track — X: rotating track — V: reset camera — Orbit: left-click drag — Zoom: scroll
          </div>
        </div>
        <Dashboard hud={hud} />
      </div>
    </SimTickProvider>
  )
}

export default App
