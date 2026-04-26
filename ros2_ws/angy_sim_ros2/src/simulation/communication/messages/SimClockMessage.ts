/**
 * Internal, JSON-friendly clock message. NOT a ROS2 / rosgraph_msgs
 * Clock — a future adapter can map both ways.
 *
 * Units: seconds (sim time), seconds (delta), monotonically increasing
 * tick counter sourced from `SimulationState.metrics.ticks`.
 */
export interface SimClockMessage {
  timeSec: number
  dtSec: number
  tick: number
}
