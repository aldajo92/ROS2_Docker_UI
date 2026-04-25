import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { WorldFrame, Ground } from './world'
import { SimSceneConfig } from '../models/SimSceneConfig'
import { pointToSceneTuple, pointToTuple } from '../models/SimMappers'

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
// Every visual knob (light position/intensity, ground color, grid
// dimensions, etc.) lives on `config` — see `models/SimSceneConfig`
// for the full set and the named factories (`preview()` / `main()`).
export function SimScene({
  children,
  config = SimSceneConfig.preview(),
}: {
  children?: React.ReactNode
  config?: SimSceneConfig
}) {
  return (
    <>
      <ambientLight intensity={config.ambientIntensity} />
      <directionalLight
        position={pointToTuple(config.lightPosition)}
        intensity={config.lightIntensity}
        castShadow={config.castShadow}
      />
      <WorldFrame>
        <Ground size={config.groundSize} color={config.groundColor} />
        {children}
      </WorldFrame>
      <gridHelper
        args={[
          config.gridSize,
          config.gridDivisions,
          config.gridColorMajor,
          config.gridColorMinor,
        ]}
      />
    </>
  )
}

// Thin convenience wrapper for the simple cells (just orbit + look at
// the scene). Cells that need a custom camera or HUD should drop down
// to <Canvas> + <SimScene> directly instead of using this. The same
// `config` drives both the SimScene visuals and this cell's default
// camera (position + FOV).
export function SimSceneCell({
  label,
  children,
  config = SimSceneConfig.preview(),
}: {
  label: string
  children?: React.ReactNode
  config?: SimSceneConfig
}) {
  return (
    <div className="dev-grid-cell">
      <Canvas
        shadows
        camera={{
          position: pointToSceneTuple(config.cameraPosition),
          fov: config.cameraFov,
        }}
      >
        <SimScene config={config}>{children}</SimScene>
        <OrbitControls makeDefault />
      </Canvas>
      <div className="dev-grid-label">{label}</div>
    </div>
  )
}
