/**
 * Inbound command for a vehicle. All physical fields are optional —
 * a sender can publish only the channels it cares about.
 *
 * Mapping to entity APIs is the bridge's responsibility; the engine
 * never receives this shape directly.
 *
 *   linearVelocity  : m/s (forward along heading)
 *   angularVelocity : rad/s (CCW positive)
 *   throttle/brake/steering : reserved for richer kinematic models;
 *     the unicycle entity ignores them.
 *
 * A future ROS2 adapter can map this to `geometry_msgs/Twist`.
 */
export interface SimVehicleCommandMessage {
  vehicleId: string
  linearVelocity?: number
  angularVelocity?: number
  throttle?: number
  brake?: number
  steering?: number
}
