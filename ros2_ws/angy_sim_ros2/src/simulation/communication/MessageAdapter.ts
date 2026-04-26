/**
 * Bidirectional translator between an external (wire-format) message
 * and an internal simulator message.
 *
 *   external → toInternal()   → internal simulator message
 *   internal → fromInternal() → external (wire) message
 *
 * Adapters keep the simulation core ignorant of any specific external
 * schema. ROS2-specific adapters (e.g. `nav_msgs/Odometry` ↔
 * `SimVehicleStateMessage`) belong in an infrastructure / integration
 * package — never here.
 */
export interface MessageAdapter<TExternal, TInternal> {
  toInternal(message: TExternal): TInternal
  fromInternal(value: TInternal): TExternal
}
