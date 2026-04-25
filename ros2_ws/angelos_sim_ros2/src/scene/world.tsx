// Shared world-frame primitives + scene objects.
//
// The simulation is authored in a ROS/Gazebo-style frame:
//   X forward, Y left, Z up, right-handed (x × y = z).
// three.js uses a Y-up frame. We embed the world frame in the scene by
// wrapping every world-space object in a single
//   <group rotation={WORLD_TILT}>
// that rotates the world onto three.js:
//   world +X -> three.js +X
//   world +Y -> three.js -Z
//   world +Z -> three.js +Y
// This is a proper rotation (det = +1) so the right-hand rule is
// preserved and components inside <WorldFrame> can use (x, y, z) world
// coordinates directly with no sign juggling.

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Point3D } from '../models/SimBase'
import type { CarState } from '../models/CarState'

// --- Frame setup ---------------------------------------------------------

export const WORLD_TILT: [number, number, number] = [-Math.PI / 2, 0, 0]

// One and only place world coordinates get translated to scene
// coordinates (e.g. when positioning the camera, which lives outside
// <WorldFrame>).
export function worldToScene(
  x: number,
  y: number,
  z: number = 0,
): [number, number, number] {
  return [x, z, -y]
}

// Inverse of `worldToScene`. Used when reading a world-coord value back
// out of a three.js node (e.g. the camera's `position`, which is stored
// in scene space because the camera lives outside <WorldFrame>).
export function sceneToWorld(
  x: number,
  y: number,
  z: number,
): [number, number, number] {
  return [x, -z, y]
}

export const GROUND_SIZE = 30
export const CAR_RADIUS = 0.3

export function WorldFrame({ children }: { children: React.ReactNode }) {
  return <group rotation={WORLD_TILT}>{children}</group>
}

// --- Solid objects -------------------------------------------------------
// Everything below is meant to live INSIDE <WorldFrame>, so coordinates
// and dimensions are expressed in world (x, y, z) directly.

export function Ground({ size = GROUND_SIZE }: { size?: number } = {}) {
  return (
    <mesh position={[0, 0, -0.01]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#2a2a2a" />
    </mesh>
  )
}

interface ArrowProps {
  length?: number
  shaftRadius?: number
  tipRadius?: number
  tipLength?: number
  color?: string
}

// Arrow pointing along its local +X axis. Internally uses three.js
// geometry conventions but externally behaves as a pure "+X arrow", so
// it composes naturally with parent rotations in any frame.
export function Arrow({
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

// Gazebo/ROS convention: X = red, Y = green, Z = blue, right-handed.
export function WorldAxes({ length = 1.0 }: { length?: number }) {
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

export function OriginMarker() {
  return (
    <mesh position={[0, 0, 0.02]}>
      <boxGeometry args={[0.2, 0.2, 0.04]} />
      <meshStandardMaterial color="#50c850" />
    </mesh>
  )
}

export function Car({ state }: { state: CarState }) {
  const groupRef = useRef<THREE.Group>(null!)

  // The car pose updates every simulation step via the parent's
  // `stateRef`, but state itself is a ref so React doesn't re-render.
  // Sync from ref to the three.js node here, every frame.
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

export function Trail({ points }: { points: ReadonlyArray<Point3D> }) {
  if (points.length < 2) return null
  // drei's <Line> wants tuples or Vector3s. Inlining the conversion
  // here keeps `world.tsx` free of a dependency on `models/SimMappers`
  // (which would create an import cycle: world -> mappers -> world).
  const tuples = points.map(
    (p): [number, number, number] => [p.x, p.y, p.z],
  )
  return <Line points={tuples} color="#ff5050" lineWidth={2} />
}
