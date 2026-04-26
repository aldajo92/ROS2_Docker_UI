/**
 * Documentation-only constants for the simulation ↔ Three.js
 * coordinate mapping. Values are typed `as const` so they show up in
 * editor hovers and can be referenced from comments / tests without
 * accidentally drifting from the actual mapping in `simToThree.ts`.
 *
 * Simulation engine convention (right-handed, Z-up):
 *
 *     +X right
 *     +Y forward
 *     +Z up
 *     yaw in radians, CCW positive from +X
 *
 * Three.js convention (right-handed, Y-up):
 *
 *     +X right
 *     +Y up
 *     +Z toward the default camera (i.e. "out of the screen")
 *
 * Mapping used everywhere in this renderer:
 *
 *     sim.x → three.x
 *     sim.y → three.z
 *     sim.z → three.y
 *
 * Yaw mapping assumes the vehicle mesh's local forward axis is +X
 * (matching the engine convention). With that convention,
 * `rotation.y = -yaw` rotates the mesh so it points along sim +Y when
 * yaw = π/2 — see the proof in `simToThree.ts`.
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
  simX: 'threeX',
  simY: 'threeZ',
  simZ: 'threeY',
} as const

export const VEHICLE_MESH_FORWARD_AXIS = '+X' as const
