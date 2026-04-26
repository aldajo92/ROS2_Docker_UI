import type { SimPose2DMessage } from './SimPose2DMessage'

/**
 * Snapshot of a single vehicle, suitable for outbound telemetry.
 * `velocity` is m/s along heading, `angularVelocity` is rad/s CCW.
 *
 * A future ROS2 adapter can map this to `nav_msgs/Odometry`.
 */
export interface SimVehicleStateMessage {
  id: string
  pose: SimPose2DMessage
  velocity: number
  angularVelocity: number
}
