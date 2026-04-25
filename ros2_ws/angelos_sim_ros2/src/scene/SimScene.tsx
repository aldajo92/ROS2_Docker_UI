import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { WorldFrame, Ground } from './world'
import { Point3D } from '../models/SimBase'
import { pointToSceneTuple, pointToTuple } from '../models/SimMappers'

// Default key-light position for the preview cells (close, soft).
// Authored in scene-space because the directional light lives outside
// <WorldFrame> (lights aren't part of the world content).
const DEFAULT_LIGHT_POS = new Point3D(5, 5, 5)

// SimSceneCell's default camera, authored in WORLD coords so the
// literal reads naturally ("12m forward, 12m left, 18m up"). The
// pointToSceneTuple mapper handles the world->scene rotation.
const SIM_SCENE_CELL_CAM_POS = new Point3D(12, -12, 18)

// In-scene primitives shared by every dev cell:
//   - ambient + directional light
//   - world frame + ground plane
//   - grid helper (visual aid, sits outside the world frame because
//     `gridHelper` is already authored in three.js' Y-up convention)
//
// Designed to live INSIDE a <Canvas>; pass world-space children to
// populate the scene. The cell also chooses its own camera + controls,
// which is why those are NOT included here.
//
// `lightPosition` and `castShadow` are exposed because the main sim
// uses a larger, shadow-casting key light tuned for the full ground
// plane, while the small preview cells use a closer, shadow-less light.
// `lightPosition` is in scene-space (lights live outside WorldFrame).
export function SimScene({
  children,
  lightPosition = DEFAULT_LIGHT_POS,
  castShadow = false,
}: {
  children?: React.ReactNode
  lightPosition?: Point3D
  castShadow?: boolean
}) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={pointToTuple(lightPosition)}
        intensity={1}
        castShadow={castShadow}
      />
      <WorldFrame>
        <Ground />
        {children}
      </WorldFrame>
      <gridHelper args={[30, 30, '#444', '#333']} />
    </>
  )
}

// Thin convenience wrapper for the simple cells (just orbit + look at
// the scene). Cells that need a custom camera or HUD should drop down
// to <Canvas> + <SimScene> directly instead of using this.
export function SimSceneCell({
  label,
  children,
}: {
  label: string
  children?: React.ReactNode
}) {
  return (
    <div className="dev-grid-cell">
      <Canvas
        shadows
        camera={{
          position: pointToSceneTuple(SIM_SCENE_CELL_CAM_POS),
          fov: 50,
        }}
      >
        <SimScene>{children}</SimScene>
        <OrbitControls makeDefault />
      </Canvas>
      <div className="dev-grid-label">{label}</div>
    </div>
  )
}
