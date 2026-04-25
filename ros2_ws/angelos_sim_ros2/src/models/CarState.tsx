// Runtime state of the simulated car. Authored in the world frame
// (X forward, Y left, Z up); see `scene/world.tsx` for the frame
// definition.
//
// Kept as an interface (and intentionally not a class) so it stays a
// plain mutable record that the simulation loop can update in place
// inside a `useRef`. Promoting this to a `class CarState` (with a
// `Point2D` pose, a velocity model, etc.) is a deliberate decision —
// it touches the physics step, the collision loop, and every
// component that reads `state.x`/`state.y`/`state.yaw` directly — so
// it's left for an explicit follow-up.
export interface CarState {
  // World-space ground position (meters).
  x: number
  y: number
  // Heading angle (radians, CCW from world +X).
  yaw: number
  // Current linear and angular velocity (m/s, rad/s).
  v: number
  w: number
  // True for the frame in which the car is overlapping at least one
  // obstacle. Cleared as soon as the resolver pushes the car free.
  colliding: boolean
}
