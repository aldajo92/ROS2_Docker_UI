/**
 * Type-safe event map for the simulation engine. Anyone subscribing
 * via `engine.events.on(...)` gets compile-time payload typing.
 */
export interface SimulationEvents extends Record<string, unknown> {
  tick: { time: number; dt: number; ticks: number }
  started: undefined
  paused: undefined
  reset: undefined
  scenarioLoaded: { name: string }
  collision: { a: string; b: string; time: number }
  entityAdded: { id: string }
  entityRemoved: { id: string }
}
