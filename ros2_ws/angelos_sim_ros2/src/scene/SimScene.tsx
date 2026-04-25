import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { WorldFrame, Ground } from './world'

// In-scene primitives shared by every dev cell:
//   - ambient + directional light
//   - world frame + ground plane
//   - grid helper (visual aid, sits outside the world frame because
//     `gridHelper` is already authored in three.js' Y-up convention)
//
// Designed to live INSIDE a <Canvas>; pass world-space children to
// populate the scene. The cell also chooses its own camera + controls,
// which is why those are NOT included here.
export function SimScene({ children }: { children?: React.ReactNode }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1} />
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
      <Canvas shadows camera={{ position: [12, 18, 12], fov: 50 }}>
        <SimScene>{children}</SimScene>
        <OrbitControls makeDefault />
      </Canvas>
      <div className="dev-grid-label">{label}</div>
    </div>
  )
}
