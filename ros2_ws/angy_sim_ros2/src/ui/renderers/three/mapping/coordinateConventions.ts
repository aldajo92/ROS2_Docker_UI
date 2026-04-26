/**
 * Documentation-only constants for the simulation ↔ Three.js
 * coordinate mapping. Values are typed `as const` so they show up in
 * editor hovers and can be referenced from comments / tests without
 * accidentally drifting from the actual mapping in `simToThree.ts`.
 *
 * Simulation engine convention (right-handed, Z-up):
 *
 *     +X right, +Y forward, +Z up
 *     yaw in radians, CCW positive from +X about +Z
 *
 * Three.js convention (right-handed, Y-up):
 *
 *     +X right, +Y up, +Z toward the default camera
 *
 * Mapping used everywhere in this renderer (right-handed embedding):
 *
 *     sim.x →  three.x
 *     sim.y → -three.z      (sign flip — preserves handedness)
 *     sim.z →  three.y
 *
 * Why the sign flip on Y. Without it (`sim.y → +three.z`), the
 * embedded sim frame is **left-handed in three space** — `simX ×
 * simY` evaluates to `-simZ`. A Three.js camera local frame is
 * always right-handed, so the resulting visual frame ends up flipped
 * in some axis no matter how `up` is set. With the sign flip,
 * embedding handedness matches three's and Gazebo-style top-down
 * (`+X right, +Y up, X×Y = +Z toward viewer`) becomes the natural
 * configuration of `lookAt` + `up`.
 *
 * Yaw mapping under this convention is identity: `rotation.y = +yaw`
 * (no sign flip). See the proof in `simToThree.ts`.
 */

export const SIM_COORDINATE_CONVENTION = {
  handedness: 'right-handed',
  x: '+X right',
  y: '+Y forward',
  z: '+Z up',
  angleUnit: 'radians',
  distanceUnit: 'meters',
} as const

export const THREE_COORDINATE_MAPPING = {
  simX: '+threeX',
  simY: '-threeZ',
  simZ: '+threeY',
  handedness: 'right-handed (in three space)',
} as const

export const VEHICLE_MESH_FORWARD_AXIS = '+X' as const
