import type { PoseMarker2D } from './PoseMarker2D'

/**
 * A named collection of 2-D poses, sourced from a single ROS
 * `geometry_msgs/msg/PoseArray` topic. One `PoseArray2D` is produced
 * per subscribed topic; the `id` equals the topic name (set by the
 * adapter).
 */
export interface PoseArray2D {
  id: string
  frameId?: string
  poses: PoseMarker2D[]
  /** CSS hex color, e.g. '#00bcd4'. Stamped by the display plugin. */
  color?: string
  /** Total arrow length in meters. Stamped by the display plugin. */
  arrowSize?: number
  /** Arrow shaft thickness (renderer-specific units). Stamped by the display plugin. */
  thickness?: number
}
