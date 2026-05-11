import type { MessageAdapter } from '../../../../simulation/communication/MessageAdapter'
import type { SimPoseWithCovarianceMessage } from '../../../../simulation/communication/messages/SimPoseWithCovarianceMessage'

const NANOS_PER_SEC = 1_000_000_000

/**
 * Adapter: `SimPoseWithCovarianceMessage` → `geometry_msgs/msg/PoseWithCovarianceStamped`.
 *
 * Outbound only (`fromInternal`). Converts:
 *   - `header.stampSec` → `{ sec, nanosec }` integer pair (same split as `SimClockToRosClockAdapter`)
 *   - `header.frameId`  → `header.frame_id`
 *   - planar yaw        → quaternion (qx=0, qy=0, qz=sin(yaw/2), qw=cos(yaw/2))
 *   - 36-element covariance array passed through unchanged
 *
 * ROS naming (`frame_id`, `nanosec`, `orientation`) is confined to this adapter.
 */
export class SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter
  implements MessageAdapter<unknown, SimPoseWithCovarianceMessage>
{
  toInternal(_message: unknown): SimPoseWithCovarianceMessage {
    throw new Error('SimPoseWithCovarianceToRosPoseWithCovarianceStampedAdapter: toInternal is not implemented (outbound-only adapter)')
  }

  fromInternal(value: SimPoseWithCovarianceMessage): unknown {
    const { stampSec, frameId } = value.header
    const sec = Math.floor(stampSec)
    let nanosec = Math.round((stampSec - sec) * NANOS_PER_SEC)
    let adjustedSec = sec
    if (nanosec === NANOS_PER_SEC) {
      adjustedSec += 1
      nanosec = 0
    }

    const halfYaw = value.pose.yaw / 2
    const qz = Math.sin(halfYaw)
    const qw = Math.cos(halfYaw)

    return {
      header: {
        stamp: { sec: adjustedSec, nanosec },
        frame_id: frameId,
      },
      pose: {
        pose: {
          position: { x: value.pose.x, y: value.pose.y, z: value.pose.z ?? 0 },
          orientation: { x: 0, y: 0, z: qz, w: qw },
        },
        covariance: value.covariance,
      },
    }
  }
}
