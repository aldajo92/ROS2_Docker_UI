/**
 * Pure ROS 2 message-type definitions used by the rosbridge transport
 * and adapters. These are wire-format shapes — they match what
 * `rosbridge_server` ↔ `roslibjs` exchange over JSON envelopes.
 *
 * This file MUST stay free of any `roslib` import. Bringing the wire
 * shapes in via plain interfaces means:
 *
 *   - Adapter unit tests can construct fixtures without spinning up a
 *     ROS process.
 *   - The simulation core never sees these types: only the rosbridge
 *     adapters import them, and the core stays transport-agnostic.
 *
 * For ROS 2, the canonical message-type identifier is
 * `<package>/msg/<Message>` (e.g. `geometry_msgs/msg/Twist`). Older
 * ROS 1 strings (`geometry_msgs/Twist`) are intentionally NOT used:
 * we target rosbridge_server running against ROS 2, which is what
 * `angy_sim_ros2` is built around.
 */

export interface RosVector3 {
  x: number
  y: number
  z: number
}

/** `geometry_msgs/msg/Twist` */
export interface RosTwistMessage {
  linear: RosVector3
  angular: RosVector3
}

/** `builtin_interfaces/msg/Time` — also the body of `rosgraph_msgs/Clock`. */
export interface RosTimeMessage {
  sec: number
  nanosec: number
}

/** `rosgraph_msgs/msg/Clock` */
export interface RosClockMessage {
  clock: RosTimeMessage
}

/**
 * `std_msgs/msg/Header`. Only the fields adapters actually use are
 * required; `stamp` is optional because some publishers leave it
 * zero-stamped (the simulator doesn't read the timestamp anyway).
 */
export interface RosHeaderMessage {
  stamp?: RosTimeMessage
  frame_id?: string
}

/** `geometry_msgs/msg/Point` */
export interface RosPointMessage {
  x: number
  y: number
  z: number
}

/** `geometry_msgs/msg/Quaternion` */
export interface RosQuaternionMessage {
  x: number
  y: number
  z: number
  w: number
}

/** `geometry_msgs/msg/Pose` */
export interface RosPoseMessage {
  position: RosPointMessage
  orientation: RosQuaternionMessage
}

/** `geometry_msgs/msg/PoseStamped` */
export interface RosPoseStampedMessage {
  header?: RosHeaderMessage
  pose: RosPoseMessage
}

/** `nav_msgs/msg/Path` */
export interface RosPathMessage {
  header?: RosHeaderMessage
  poses: RosPoseStampedMessage[]
}

export const ROS_MESSAGE_TYPES = {
  twist: 'geometry_msgs/msg/Twist',
  clock: 'rosgraph_msgs/msg/Clock',
  path: 'nav_msgs/msg/Path',
} as const

export type RosMessageType =
  (typeof ROS_MESSAGE_TYPES)[keyof typeof ROS_MESSAGE_TYPES]
