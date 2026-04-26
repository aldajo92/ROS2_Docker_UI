/**
 * Camera projection model. Orthogonal to `CameraMode`: any combination
 * (orbit + ortho, follow + ortho, etc.) is allowed. Switching projection
 * swaps the underlying `THREE.Camera` instance — see
 * `ThreeSimulationRenderer.setProjection` for the camera-rebind dance
 * (controllers must reattach so OrbitControls re-binds to the new
 * camera object).
 */
export type Projection = 'perspective' | 'orthographic'
