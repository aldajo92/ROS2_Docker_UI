import type { TrajectoryTrackingConfig } from '../trajectories/TrajectoryTrackingConfig'

/**
 * Type-safe event map for the simulation engine. Anyone subscribing
 * via `engine.events.on(...)` gets compile-time payload typing.
 */
export interface SimulationEvents extends Record<string, unknown> {
  tick: { time: number; dt: number; ticks: number }
  started: undefined
  paused: undefined
  reset: undefined
  scenarioLoaded: { name: string; trajectoryTracking?: TrajectoryTrackingConfig }
  /** Leading-edge contact between two entities. `normal` (unit, A→B,
   *  in simulation X/Y) and `penetrationDepth` (meters) are populated
   *  when the active collision backend can compute them; consumers
   *  must tolerate them being undefined. */
  collision: {
    a: string
    b: string
    time: number
    normal?: { x: number; y: number }
    penetrationDepth?: number
  }
  entityAdded: { id: string }
  entityRemoved: { id: string }
}
