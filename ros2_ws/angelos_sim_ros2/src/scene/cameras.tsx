// Reusable camera primitives shared across the dev cells (and meant to
// grow into the main App's camera too over time).
//
// Three building blocks live here:
//   1. `ProjectionCamera` — a drop-in switchable perspective/ortho
//      camera that uses drei's primitives and remounts on toggle so
//      `makeDefault` always rebinds to the active projection.
//   2. `PresetCameraRig` — snaps the active camera to a (position, up,
//      lookAt) preset every time `presetKey` changes.
//   3. `CameraHud` — writes the live camera + orbit target to a DOM
//      ref a few times per second, no React re-renders.
//
// Plus a small data block for the canonical "look at the car" presets,
// so any cell that wants those views can reuse the same definitions.

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  OrthographicCamera,
  PerspectiveCamera,
} from '@react-three/drei'
import * as THREE from 'three'
import { Point3D } from '../models/SimBase'
import {
  pointToSceneTuple,
  sceneVector3ToPoint3D,
} from '../models/SimMappers'

// --- Types & data --------------------------------------------------------

export type Projection = 'perspective' | 'orthographic'

export interface CamPreset {
  // Camera position in world coords.
  pos: Point3D
  // Camera "up" direction in world coords. Top-down views need a
  // non-Z up so a particular world axis stays "up on screen". (Point3D
  // is reused to represent direction vectors here; our world<->scene
  // transform is a proper rotation, so directions map correctly too.)
  up: Point3D
}

// "Look at the car" view presets. Standard orientations for inspecting
// a vehicle parked at the world origin.
export type CarCamView = 'orbit' | 'top' | 'front' | 'side' | 'rear'

export const CAR_CAM_PRESETS: Record<CarCamView, CamPreset> = {
  orbit: { pos: new Point3D(3, 3, 2.5), up: new Point3D(0, 0, 1) },
  top: { pos: new Point3D(0, 0, 6), up: new Point3D(1, 0, 0) },
  front: { pos: new Point3D(3, 0, 1.2), up: new Point3D(0, 0, 1) },
  side: { pos: new Point3D(0, 3, 1.2), up: new Point3D(0, 0, 1) },
  rear: { pos: new Point3D(-3, 0, 1.2), up: new Point3D(0, 0, 1) },
}

// Camera target ~car body height (15 cm) so the lookAt isn't right at
// ground level.
export const CAR_CAM_TARGET: Point3D = new Point3D(0, 0, 0.15)

export const CAR_CAM_BUTTONS: ReadonlyArray<{
  id: CarCamView
  label: string
}> = [
  { id: 'orbit', label: 'Orbit' },
  { id: 'top', label: 'Top' },
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'rear', label: 'Rear' },
]

export const PROJECTION_BUTTONS: ReadonlyArray<{
  id: Projection
  label: string
}> = [
  { id: 'perspective', label: 'Perspective' },
  { id: 'orthographic', label: 'Orthographic' },
]

// --- Components ----------------------------------------------------------

// Switchable perspective/orthographic camera. Uses drei's primitives
// under the hood; we remount on projection change (via React `key`) so
// drei re-registers the new instance as the default camera. The cell
// can then attach OrbitControls and a rig to that default.
export function ProjectionCamera({
  projection,
  fov = 50,
  zoom = 80,
  near = 0.1,
  far = 1000,
}: {
  projection: Projection
  fov?: number
  zoom?: number
  near?: number
  far?: number
}) {
  return projection === 'perspective' ? (
    <PerspectiveCamera
      key="perspective"
      makeDefault
      fov={fov}
      near={near}
      far={far}
    />
  ) : (
    <OrthographicCamera
      key="orthographic"
      makeDefault
      zoom={zoom}
      near={near}
      far={far}
    />
  )
}

// Snaps the active camera to a (position, up, lookAt) preset. Re-runs
// whenever `presetKey` or the underlying camera object changes — that
// covers both view toggles and projection swaps (which mount a new
// camera object).
export function PresetCameraRig({
  preset,
  target,
  presetKey,
}: {
  preset: CamPreset
  target: Point3D
  // Caller-supplied identity used to detect "user picked a different
  // preset" without needing a deep compare on `preset` itself.
  presetKey: string
}) {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(...pointToSceneTuple(preset.pos))
    camera.up.set(...pointToSceneTuple(preset.up))
    camera.lookAt(...pointToSceneTuple(target))
    camera.updateProjectionMatrix()
    // Including `preset`/`target` here would re-snap on every render
    // because the parent passes fresh array literals. `presetKey` is
    // the explicit identity to react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, camera])
  return null
}

// Live camera HUD. Samples the camera + OrbitControls target at ~10 Hz
// and writes the result imperatively into a DOM ref to avoid triggering
// React renders every frame.
export function CameraHud({
  hudRef,
  controlsRef,
}: {
  hudRef: React.RefObject<HTMLDivElement | null>
  // OrbitControls ref; we only need `.target`, but the type from drei
  // is a noisy union, so leaving it as `any` here.
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
    const camWorld = sceneVector3ToPoint3D(camera.position)
    const targetSceneVec = controlsRef.current?.target as
      | THREE.Vector3
      | undefined
    const targetWorld = targetSceneVec
      ? sceneVector3ToPoint3D(targetSceneVec)
      : new Point3D(0, 0, 0)
    const proj = cam.isOrthographicCamera ? 'ortho' : 'persp'
    const lens = cam.isOrthographicCamera
      ? `zoom=${(cam.zoom ?? 1).toFixed(1)}`
      : `fov=${(cam.fov ?? 0).toFixed(0)}°`
    const fmt = (n: number) => n.toFixed(2)

    node.textContent =
      `proj  ${proj}  ${lens}\n` +
      `pos   (${fmt(camWorld.x)}, ${fmt(camWorld.y)}, ${fmt(camWorld.z)})\n` +
      `look  (${fmt(targetWorld.x)}, ${fmt(targetWorld.y)}, ${fmt(targetWorld.z)})`
  })

  return null
}
